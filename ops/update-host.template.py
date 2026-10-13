#!/usr/bin/env python3
"""Atomic helper update + one explicit public landing host; retains app restrictions."""
import base64, contextlib, datetime, fcntl, hashlib, json, os, pwd, re, stat, subprocess, tempfile
from pathlib import Path
SOURCE_SHA='__SOURCE_SHA__'
BUNDLE_SHA='__BUNDLE_SHA__'
BUNDLE='__BUNDLE_B64__'
HOST='binnenkort.dartspoint.nl'
def safe_file(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_uid!=0 or path.stat().st_mode & 0o022:raise RuntimeError('Unexpected managed ownership: '+str(path))
def atomic(path, data, mode=0o644):
    fd,temporary=tempfile.mkstemp(prefix='.dartspoint-update-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as output:output.write(data)
        os.chown(temporary,0,0);os.chmod(temporary,mode);os.replace(temporary,path)
    finally:Path(temporary).unlink(missing_ok=True)
def main():
    if os.geteuid()!=0:raise RuntimeError('Administrator execution required')
    os.umask(0o077);data=base64.b64decode(BUNDLE,validate=True)
    if hashlib.sha256(data).hexdigest()!=BUNDLE_SHA:raise RuntimeError('Bundle checksum mismatch')
    files=json.loads(data);managed=Path('/usr/local/libexec/dartspoint');safe_file(managed/'delivery-entry.py')
    safe_file(Path('/etc/dartspoint/image-pins.json'))
    if json.loads(Path('/etc/dartspoint/image-pins.json').read_text())!=json.loads(files.pop('image-pins.json')):raise RuntimeError('Image pin upgrades require separate review')
    block=files.pop('landing.caddy');caddy=Path('/etc/caddy/Caddyfile');safe_file(caddy);original=caddy.read_text();marker='# DartsPoint public landing 2026-10-13\n'
    if HOST in original:
        if marker+block not in original:raise RuntimeError('Landing hostname already has an unrecognized host block')
        next_caddy=original
    else:next_caddy=original.rstrip()+'\n\n'+marker+block
    for domain in ('staging.dartspoint.nl','realtime.staging.dartspoint.nl'):
        if domain not in original:raise RuntimeError('Both protected staging host blocks must already exist')
    targets={managed/name:source.encode() for name,source in files.items()}
    if any(not re.fullmatch(r'[a-z0-9_-]+\.py',path.name) for path in targets):raise RuntimeError('Unexpected bundle member')
    targets[caddy]=next_caddy.encode()
    with contextlib.ExitStack() as stack:
        for env in ('staging','production'):
            runner=pwd.getpwnam('runner-'+env);app=pwd.getpwnam('dartspoint-'+env);lockpath=Path('/var/lib/dartspoint-delivery')/env/'delivery.lock'
            fd=os.open(lockpath,os.O_RDWR|os.O_NOFOLLOW);lock=stack.enter_context(os.fdopen(fd,'r+'));metadata=os.fstat(fd)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=runner.pw_uid or metadata.st_nlink!=1:raise RuntimeError('Unexpected delivery lock')
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise RuntimeError('A deployment is active; retry once completed') from None
            if (lockpath.parent/'pending.json').exists():raise RuntimeError('Pending delivery requires inspection')
        originals={}
        for path in targets:
            safe_file(path);originals[path]=(path.read_bytes(),stat.S_IMODE(path.stat().st_mode))
        backup=Path('/var/backups')/('dartspoint-host-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(mode=0o700)
        inventory=[]
        for index,(path,(content,mode)) in enumerate(originals.items()):
            saved=backup/(str(index)+'.original');saved.write_bytes(content);inventory.append({'path':str(path),'backup':saved.name,'mode':mode})
        (backup/'manifest.json').write_text(json.dumps({'source':SOURCE_SHA,'files':inventory},indent=2)+'\n')
        fd,validation=tempfile.mkstemp(prefix='.dartspoint-validation-',suffix='.Caddyfile',dir=caddy.parent)
        try:
            with os.fdopen(fd,'w') as output:output.write(next_caddy)
            subprocess.run(['/usr/bin/caddy','validate','--config',validation,'--adapter','caddyfile'],check=True)
        finally:Path(validation).unlink(missing_ok=True)
        try:
            for path,content in targets.items():atomic(path,content,originals[path][1])
            subprocess.run(['/usr/bin/caddy','reload','--config',str(caddy),'--adapter','caddyfile'],check=True)
        except Exception:
            for path,(content,mode) in originals.items():atomic(path,content,mode)
            subprocess.run(['/usr/bin/caddy','reload','--config',str(caddy),'--adapter','caddyfile'],check=False)
            raise
    print('Managed helpers and public landing host installed. Source: '+SOURCE_SHA)
    print('Private rollback backup: '+str(backup))
    print('DNS A: binnenkort.dartspoint.nl -> 178.105.113.148')
if __name__=='__main__':main()
