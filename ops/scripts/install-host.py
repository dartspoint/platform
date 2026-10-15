#!/usr/bin/env python3
"""One-time reviewed installation by the VPS administrator, never a workflow step."""
import grp, json, os, pwd, shutil, subprocess, sys
from pathlib import Path
from deployment_config import validate_public

def safe_directory(path, mode, uid=0, gid=0):
    if path.is_symlink(): raise ValueError('Refuse symlink during installation')
    if path.exists() and path.stat().st_uid not in (0,uid): raise ValueError('Unexpected existing path ownership; inventory first')
    path.mkdir(parents=False,exist_ok=True)
    os.chown(path,uid,gid);path.chmod(mode)

def install_file(source, target, mode=0o644):
    if target.is_symlink(): raise ValueError('Refuse symlink target')
    shutil.copyfile(source,target);os.chown(target,0,0);target.chmod(mode)

def sudoers_rule(env):
    if env not in ('staging','production'): raise ValueError('Invalid sudoers environment')
    return 'Defaults:runner-'+env+' !setenv\nrunner-'+env+' ALL=(dartspoint-'+env+') NOPASSWD: /usr/local/libexec/dartspoint-deploy-'+env+' ""\n'

def main():
    if os.geteuid()!=0: raise ValueError('Run this reviewed installer as the administrator')
    if len(sys.argv)!=2: raise ValueError('Usage: install-host.py ADMINISTRATOR_REVIEWED_PUBLIC_CONFIG.json')
    policies=json.loads(Path(sys.argv[1]).read_text())
    if not policies or not set(policies)<= {'staging','production'}: raise ValueError('Configure at least one known environment public policy')
    policies={env:validate_public(env,values) for env,values in policies.items()}
    if len({values['NEXT_PUBLIC_SUPABASE_URL'] for values in policies.values()})!=len(policies): raise ValueError('Use separate Supabase projects for staging and production')
    source=Path(__file__).resolve().parent.parent
    accounts={env:(pwd.getpwnam('dartspoint-'+env),pwd.getpwnam('runner-'+env)) for env in ('staging','production')}
    users=[user for pair in accounts.values() for user in pair]
    if len({user.pw_uid for user in users})!=4 or len({user.pw_gid for user in users})!=4:
        raise ValueError('Four separate service users and private primary groups are required')
    for user in users:
        if grp.getgrgid(user.pw_gid).gr_name!=user.pw_name: raise ValueError('Each service account needs its own named group')
        for group in grp.getgrall():
            if user.pw_name in group.gr_mem and (group.gr_name in ('sudo','docker','root') or group.gr_name in {u.pw_name for u in users if u!=user}):
                raise ValueError('Remove broad or cross-environment service account groups before installation')
    # Refuse permissive/root-owned old runtimes; migrations need separate inventory.
    for env,(app,runner) in accounts.items():
        if app.pw_uid==0 or runner.pw_uid==0 or app.pw_uid==runner.pw_uid: raise ValueError('Separate unprivileged service users required')
        root=Path('/srv/dartspoint')/env
        if root.exists() and (root.is_symlink() or root.stat().st_uid!=app.pw_uid or root.stat().st_mode&0o077): raise ValueError('Inventory existing runtime before installation')
    for path in ('/srv/dartspoint','/etc/dartspoint','/usr/local/libexec','/usr/local/libexec/dartspoint','/var/lib/dartspoint-delivery'):
        safe_directory(Path(path),0o755)
    for script in (source/'scripts').glob('*.py'):
        if script.name in ('install-host.py','check-ops.py','backup-gate.example.py'): continue
        install_file(script,Path('/usr/local/libexec/dartspoint')/script.name)
    install_file(source/'image-pins.json',Path('/etc/dartspoint/image-pins.json'))
    for env,(app,runner) in accounts.items():
        root=Path('/srv/dartspoint')/env
        safe_directory(root,0o700,app.pw_uid,app.pw_gid)
        safe_directory(root/'releases',0o700,app.pw_uid,app.pw_gid)
        safe_directory(Path('/etc/dartspoint')/env,0o755)
        install_file(source/'compose.target.yml',Path('/etc/dartspoint')/env/'compose.yml')
        if env in policies:
            policy=Path('/etc/dartspoint')/env/'public.json'
            if policy.is_symlink():raise ValueError('Refuse public policy symlink')
            policy.write_text(json.dumps(policies[env],indent=2)+'\n');os.chown(policy,0,0);policy.chmod(0o644)
        safe_directory(Path('/var/lib/dartspoint-delivery')/env,0o2750,runner.pw_uid,app.pw_gid)
        wrapper=Path('/usr/local/libexec/dartspoint-deploy-'+env)
        if wrapper.is_symlink(): raise ValueError('Refuse wrapper symlink')
        wrapper.write_text('#!/bin/sh\nexec /usr/bin/python3 -I /usr/local/libexec/dartspoint/managed.py '+env+' "$@"\n')
        os.chown(wrapper,0,0);wrapper.chmod(0o755)
        sudoers=Path('/etc/sudoers.d/dartspoint-'+env)
        text=sudoers_rule(env)
        temporary=Path('/etc/sudoers.d/.dartspoint-'+env+'.next')
        if temporary.exists() or temporary.is_symlink() or sudoers.is_symlink(): raise ValueError('Unexpected sudoers path')
        temporary.write_text(text);temporary.chmod(0o440);os.chown(temporary,0,0)
        try: subprocess.run(['/usr/sbin/visudo','-cf',str(temporary)],check=True);temporary.replace(sudoers)
        finally: temporary.unlink(missing_ok=True)
        for operation,hour in (('backup','01' if env=='staging' else '03'),('retention','02' if env=='staging' else '04'),('privacy-ledger',None)):
            stem='dartspoint-'+operation+'-'+env
            service=Path('/etc/systemd/system')/(stem+'.service')
            timer=Path('/etc/systemd/system')/(stem+'.timer')
            if service.is_symlink() or timer.is_symlink(): raise ValueError('Unexpected systemd path')
            service.write_text('[Unit]\nDescription=DartsPoint '+env+' '+operation+'\n[Service]\nType=oneshot\nUser='+app.pw_name+'\nGroup='+app.pw_name+'\nUMask=0077\nWorkingDirectory='+str(root)+'\nExecStart=/usr/bin/python3 -I /usr/local/libexec/dartspoint/periodic.py '+env+' '+operation+'\nCPUQuota=50%\nMemoryMax=768M\nTasksMax=128\nTimeoutStartSec=45min\n')
            calendar='*-*-* *:*:00' if operation=='privacy-ledger' else '*-*-* '+hour+':00:00'
            timer.write_text('[Unit]\nDescription=DartsPoint scheduled '+operation+' '+env+'\n[Timer]\nOnCalendar='+calendar+'\nRandomizedDelaySec='+('5s' if operation=='privacy-ledger' else '5min')+'\nPersistent=true\nUnit='+stem+'.service\n[Install]\nWantedBy=timers.target\n')
            for file in (service,timer):os.chown(file,0,0);file.chmod(0o644)
    subprocess.run(['/usr/sbin/visudo','-c'],check=True)
    print('Managed files installed. Enable reviewed timers only after the first healthy release; review Caddy separately.')

if __name__=='__main__': main()
