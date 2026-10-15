#!/usr/bin/env python3
"""Reviewed staging support update. No production service, Caddy site, timer or DNS mutation."""
import base64, contextlib, datetime, fcntl, hashlib, json, os, pwd, re, stat, subprocess, tempfile
from pathlib import Path
SOURCE_SHA='__SOURCE_SHA__'
BUNDLE_SHA='__BUNDLE_SHA__'
BUNDLE='__BUNDLE_B64__'
SCANNER_PIN='clamav/clamav:stable@sha256:638d90201ee7ee6a82d249a2fc23b132e578673b5f1f2766852b127676ca1ef6'
OUTSIDE='    @outside not remote_ip 100.64.0.0/10 fd7a:115c:a1e0::/48 127.0.0.1 ::1'
WEBHOOK_RULE='''    # DartsPoint signed receiving webhook 2026-10-15; only this exact POST is public.
    @outside {
        not remote_ip 100.64.0.0/10 fd7a:115c:a1e0::/48 127.0.0.1 ::1
        not path /api/support/inbound
    }
    @support_wrong_method {
        path /api/support/inbound
        not method POST
    }
    respond @support_wrong_method 405'''

def staging_span(text):
    matches=list(re.finditer(r'^staging\.dartspoint\.nl\s*\{',text,re.M))
    if len(matches)!=1:raise RuntimeError('Exactly one recognized staging app site required')
    start=matches[0].start();position=text.index('{',start);depth=0;quote=None;escaped=False;comment=False
    for index in range(position,len(text)):
        char=text[index]
        if comment:
            if char=='\n':comment=False
            continue
        if escaped:escaped=False;continue
        if char=='\\':escaped=True;continue
        if quote:
            if char==quote:quote=None
            continue
        if char in ('"',"'",'`'):quote=char;continue
        if char=='#':comment=True;continue
        if char=='{':depth+=1
        elif char=='}':
            depth-=1
            if depth==0:return start,index+1
    raise RuntimeError('Unbalanced staging Caddy site')

def staging_webhook(text):
    start,end=staging_span(text);block=text[start:end]
    def tokens(line):return line.split('#',1)[0].split()
    def lines(name):return list(re.finditer(r'(?m)^[ \t]*'+re.escape(name)+r'(?=[ \t\r\n]|$)[^\r\n]*(?:\r?\n|$)',block))
    def matcher_body(match):
        # Only the two known flat matcher forms are accepted. Unknown nested
        # blocks or additional predicates require inspection, never guessing.
        if tokens(match.group())!=[tokens(match.group())[0],'{']:return None
        body=[]
        for line in block[match.end():].splitlines():
            value=tokens(line)
            if value==['}']:return body
            if value:body.append(value)
        return None
    def same_allowlist(value):
        expected=OUTSIDE.split()[3:]
        return value[:2]==['not','remote_ip'] and len(value[2:])==len(expected) and set(value[2:])==set(expected)
    outside=lines('@outside');denials=[tokens(m.group()) for m in lines('respond') if tokens(m.group())[1:2]==['@outside']]
    upstreams=[tokens(m.group()) for m in lines('reverse_proxy')]
    method=lines('@support_wrong_method');method_denials=[tokens(m.group()) for m in lines('respond') if tokens(m.group())[1:2]==['@support_wrong_method']]
    checks={'singleOutsideMatcher':len(outside)==1,'outsideDenyExpected':denials==[['respond','@outside','403']],'upstreamExpected':upstreams==[['reverse_proxy','127.0.0.1:3001']]}
    def refuse(reason):raise RuntimeError('Staging access rules require manual inspection: '+json.dumps({'reason':reason,**checks},sort_keys=True))
    if not all(checks.values()):refuse('unrecognized_staging_boundary')
    value=tokens(outside[0].group())
    if same_allowlist(value[1:]):
        if method or method_denials:refuse('conflicting_webhook_method_rule')
        prior=outside[0];ending='\r\n' if prior.group().endswith('\r\n') else '\n' if prior.group().endswith('\n') else ''
        updated=block[:prior.start()]+WEBHOOK_RULE+ending+block[prior.end():]
        return text[:start]+updated+text[end:]
    body=matcher_body(outside[0]);checks['outsideAllowlistExpected']=bool(body and len(body)==2 and sum(same_allowlist(item) for item in body)==1 and ['not','path','/api/support/inbound'] in body)
    method_body=matcher_body(method[0]) if len(method)==1 else None
    checks['webhookMethodExpected']=bool(method_body and len(method_body)==2 and ['path','/api/support/inbound'] in method_body and ['not','method','POST'] in method_body and method_denials==[['respond','@support_wrong_method','405']])
    if not checks['outsideAllowlistExpected'] or not checks['webhookMethodExpected']:refuse('unrecognized_staging_matcher')
    # caddy fmt changes indentation; semantic recognition must still be a no-op.
    return text

def validate_pins(previous,following):
    baseline={'NODE_IMAGE','REDIS_IMAGE','POSTGRES_IMAGE'}
    if set(previous) not in (baseline,baseline|{'CLAMAV_IMAGE'}) or set(following)!=baseline|{'CLAMAV_IMAGE'}:raise RuntimeError('Unexpected image pin inventory')
    if any(previous[name]!=following[name] for name in baseline):raise RuntimeError('Existing image pins must remain unchanged')
    if following['CLAMAV_IMAGE']!=SCANNER_PIN or 'CLAMAV_IMAGE' in previous and previous['CLAMAV_IMAGE']!=SCANNER_PIN:raise RuntimeError('Only the reviewed ClamAV pin may be added')

def safe_directory(path):
    info=path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise RuntimeError('Unexpected managed directory: '+str(path))

def target_state(path):
    safe_directory(path.parent)
    if not path.exists() and not path.is_symlink():return None
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1 or info.st_mode&0o022:raise RuntimeError('Unexpected managed file: '+str(path))
    return path.read_bytes(),stat.S_IMODE(info.st_mode)

def atomic(path,data,mode=0o644):
    safe_directory(path.parent);fd,temporary=tempfile.mkstemp(prefix='.dartspoint-support-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as output:output.write(data);output.flush();os.fsync(output.fileno())
        os.chown(temporary,0,0);os.chmod(temporary,mode);os.replace(temporary,path)
    finally:Path(temporary).unlink(missing_ok=True)

def take_lock(stack,path,owner):
    if path.is_symlink() or path.parent.is_symlink():raise RuntimeError('Unexpected lock path')
    try:fd=os.open(path,os.O_RDWR|os.O_NOFOLLOW)
    except FileNotFoundError:
        fd=os.open(path,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.fchown(fd,owner.pw_uid,owner.pw_gid)
    handle=stack.enter_context(os.fdopen(fd,'r+'));info=os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=owner.pw_uid or info.st_nlink!=1 or info.st_mode&0o022:raise RuntimeError('Unexpected deployment lock')
    try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('A deployment or scheduled operation is active; retry after it finishes') from None

def main():
    if os.geteuid()!=0:raise RuntimeError('Administrator execution required')
    os.umask(0o077)
    if not re.fullmatch('[0-9a-f]{40}',SOURCE_SHA):raise RuntimeError('Unbound source revision')
    raw=base64.b64decode(BUNDLE,validate=True)
    if hashlib.sha256(raw).hexdigest()!=BUNDLE_SHA:raise RuntimeError('Bundle checksum mismatch')
    files=json.loads(raw);managed=Path('/usr/local/libexec/dartspoint');safe_directory(managed)
    pins=Path('/etc/dartspoint/image-pins.json');target_state(pins);validate_pins(json.loads(pins.read_text()),json.loads(files['image-pins.json']))
    caddy=Path('/etc/caddy/Caddyfile');target_state(caddy);original=caddy.read_text();updated=staging_webhook(original)
    targets={pins:files.pop('image-pins.json').encode(),Path('/etc/dartspoint/staging/compose.yml'):files.pop('staging-compose.yml').encode(),caddy:updated.encode()}
    for name,content in files.items():
        if re.fullmatch(r'scripts/[a-z0-9_-]+\.py',name):targets[managed/name.split('/')[1]]=content.encode()
        elif re.fullmatch(r'units/dartspoint-(retention|privacy-ledger)-staging\.(service|timer)',name):targets[Path('/etc/systemd/system')/name.split('/')[1]]=content.encode()
        else:raise RuntimeError('Unexpected bundle member')
    timer_names=['dartspoint-retention-staging.timer','dartspoint-privacy-ledger-staging.timer']
    accounts={env:(pwd.getpwnam('runner-'+env),pwd.getpwnam('dartspoint-'+env)) for env in ('staging','production')}
    with contextlib.ExitStack() as stack:
        for env,(runner,app) in accounts.items():
            spool=Path('/var/lib/dartspoint-delivery')/env
            if spool.is_symlink() or spool.stat().st_uid!=runner.pw_uid or spool.stat().st_mode&0o027:raise RuntimeError('Unexpected private delivery directory')
            take_lock(stack,spool/'delivery.lock',runner)
            if any((spool/name).exists() or (spool/name).is_symlink() for name in ('pending.json','pending.next')):raise RuntimeError('Pending delivery requires inspection')
        # Shared helpers cannot change during either environment's deployment or scheduled backup.
        for env,(_,app) in accounts.items():
            runtime=Path('/srv/dartspoint')/env
            if runtime.is_symlink() or runtime.stat().st_uid!=app.pw_uid or runtime.stat().st_mode&0o077:raise RuntimeError('Unexpected application directory')
            take_lock(stack,runtime/'deploy.lock',app)
        originals={path:target_state(path) for path in targets}
        timer_state={}
        for name in timer_names:
            enabled=subprocess.run(['/usr/bin/systemctl','is-enabled',name],text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            if enabled.stdout.strip()=='masked':raise RuntimeError('A reviewed timer is masked; inspect before updating')
            active=subprocess.run(['/usr/bin/systemctl','is-active','--quiet',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            timer_state[name]=(enabled.returncode==0,active.returncode==0)
        backup=Path('/var/backups')/('dartspoint-support-host-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
        inventory=[]
        for index,(path,prior) in enumerate(originals.items()):
            saved=None
            if prior:
                saved=str(index)+'.original';(backup/saved).write_bytes(prior[0])
            inventory.append({'path':str(path),'backup':saved,'mode':prior[1] if prior else None})
        (backup/'manifest.json').write_text(json.dumps({'source':SOURCE_SHA,'bundleSha256':BUNDLE_SHA,'files':inventory,'timers':timer_state},indent=2)+'\n')
        with tempfile.TemporaryDirectory(prefix='.dartspoint-support-validation-',dir=caddy.parent) as validation:
            candidate=Path(validation)/'Caddyfile';candidate.write_text(updated)
            subprocess.run(['/usr/bin/caddy','validate','--config',str(candidate),'--adapter','caddyfile'],check=True)
            unit_paths=[]
            for path,data in targets.items():
                if path.suffix in ('.service','.timer'):
                    unit=Path(validation)/path.name;unit.write_bytes(data);unit_paths.append(str(unit))
            subprocess.run(['/usr/bin/systemd-analyze','verify',*unit_paths],check=True)
        try:
            for path,data in targets.items():atomic(path,data,originals[path][1] if originals[path] else 0o644)
            subprocess.run(['/usr/bin/systemctl','daemon-reload'],check=True)
            subprocess.run(['/usr/bin/caddy','reload','--config',str(caddy),'--adapter','caddyfile'],check=True)
            subprocess.run(['/usr/bin/systemctl','enable','--now',*timer_names],check=True)
        except Exception:
            for path,prior in originals.items():
                if prior:atomic(path,prior[0],prior[1])
                else:path.unlink(missing_ok=True)
            subprocess.run(['/usr/bin/systemctl','daemon-reload'],check=False)
            for name,(enabled,active) in timer_state.items():
                subprocess.run(['/usr/bin/systemctl','enable' if enabled else 'disable',name],check=False)
                subprocess.run(['/usr/bin/systemctl','start' if active else 'stop',name],check=False)
            subprocess.run(['/usr/bin/caddy','reload','--config',str(caddy),'--adapter','caddyfile'],check=False)
            raise
    print('Staging support host preparation installed. Source: '+SOURCE_SHA)
    print('Production Compose, Caddy sites, timers and services were preserved; no application service was restarted.')
    print('Private rollback inventory: '+str(backup))
    print('Next: review provider settings, deploy the reviewed staging release, then perform staging acceptance before production publication.')
if __name__=='__main__':main()
