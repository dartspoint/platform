#!/usr/bin/env python3
"""Package a reviewed committed staging-only host update; never serve or execute it."""
import base64, hashlib, json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def scheduled_units(operation):
    stem='dartspoint-'+operation+'-staging'
    service='[Unit]\nDescription=DartsPoint staging '+operation+'\n[Service]\nType=oneshot\nUser=dartspoint-staging\nGroup=dartspoint-staging\nUMask=0077\nWorkingDirectory=/srv/dartspoint/staging\nExecStart=/usr/bin/python3 -I /usr/local/libexec/dartspoint/periodic.py staging '+operation+'\nCPUQuota=50%\nMemoryMax=768M\nTasksMax=128\nTimeoutStartSec=45min\n'
    calendar='*-*-* *:*:00' if operation=='privacy-ledger' else '*-*-* 02:00:00'
    timer='[Unit]\nDescription=DartsPoint scheduled '+operation+' staging\n[Timer]\nOnCalendar='+calendar+'\nRandomizedDelaySec='+('5s' if operation=='privacy-ledger' else '5min')+'\nPersistent=true\nUnit='+stem+'.service\n[Install]\nWantedBy=timers.target\n'
    return {'units/'+stem+'.service':service,'units/'+stem+'.timer':timer}
def main():
    sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip():raise SystemExit('Commit and review the worktree before packaging the host update')
    files={'scripts/'+path.name:path.read_text() for path in (ROOT/'ops/scripts').glob('*.py') if path.name not in ('install-host.py','check-ops.py','backup-gate.example.py')}
    files.update({'image-pins.json':(ROOT/'ops/image-pins.json').read_text(),'staging-compose.yml':(ROOT/'ops/compose.target.yml').read_text()})
    for operation in ('retention','privacy-ledger'):files.update(scheduled_units(operation))
    payload=json.dumps(files,sort_keys=True).encode();template=(ROOT/'ops/update-support-host.template.py').read_text()
    source=template.replace('__SOURCE_SHA__',sha).replace('__BUNDLE_SHA__',hashlib.sha256(payload).hexdigest()).replace('__BUNDLE_B64__',base64.b64encode(payload).decode())
    compile(source,'support-host-update','exec')
    output=ROOT/'artifacts/dartspoint-support-host-update.py';output.parent.mkdir(exist_ok=True);output.write_text(source)
    digest=hashlib.sha256(output.read_bytes()).hexdigest();output.with_suffix('.sha256').write_text(digest+'  '+output.name+'\n')
    print(str(output));print('Source '+sha);print('SHA256 '+digest)
if __name__=='__main__':main()
