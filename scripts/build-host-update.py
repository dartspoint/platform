#!/usr/bin/env python3
"""Build a reviewable, checksum-bound root helper/Caddy update from committed code."""
import base64, hashlib, io, json, subprocess, tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
if subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip():raise SystemExit('Commit and review the worktree before building the host update')
files={}
for path in (root/'ops/scripts').glob('*.py'):
    if path.name not in ('install-host.py','check-ops.py','backup-gate.example.py'):files[path.name]=path.read_text()
files['landing.caddy']=(root/'ops/Caddyfile.landing.template').read_text().replace('__LANDING_HOST__','binnenkort.dartspoint.nl')
files['image-pins.json']=(root/'ops/image-pins.json').read_text()
payload=json.dumps(files,sort_keys=True).encode()
template=(root/'ops/update-host.template.py').read_text()
output=root/'artifacts/dartspoint-host-update.py';output.parent.mkdir(exist_ok=True)
output.write_text(template.replace('__SOURCE_SHA__',sha).replace('__BUNDLE_SHA__',hashlib.sha256(payload).hexdigest()).replace('__BUNDLE_B64__',base64.b64encode(payload).decode()))
print(str(output));print('Source '+sha);print('SHA256 '+hashlib.sha256(output.read_bytes()).hexdigest())
