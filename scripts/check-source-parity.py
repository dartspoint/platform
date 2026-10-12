#!/usr/bin/env python3
"""Verify unchanged assets/fonts/styles, with one documented responsive correction."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
subprocess.run(['python3',str(root/'reference/handoff/verify-package.py')],cwd=root,check=True)
source=root/'reference/handoff/source-sites';target=root/'apps/web'
same=[];changed=[]
for folder,pattern in [('public','**/*'),('components','**/*.css'),('app','**/*.css'),('app','**/*.woff*')]:
    for path in (source/folder).glob(pattern):
        if not path.is_file():continue
        relative=path.relative_to(source);actual=target/relative
        if not actual.is_file():raise RuntimeError('Missing source asset/style: '+str(relative))
        if hashlib.sha256(path.read_bytes()).digest()==hashlib.sha256(actual.read_bytes()).digest():same.append(str(relative))
        else:changed.append(str(relative))
assert changed==['components/darts-lobby.css'],changed
old=(source/changed[0]).read_text();new=(target/changed[0]).read_text()
assert new.startswith(old), 'Existing source CSS changed instead of an additive layout fix'
assert 'min-width: 0' in new[len(old):] or 'min-width:0' in new[len(old):]
result={'ok':True,'identicalAssetsAndStyles':len(same),'changedStyles':changed,'reason':'Additive min-width fix for 320px lobby grid; source rules retained','sourceSHA':'f57c505709e317d457de447f00c822c270edcdaf'}
(root/'artifacts').mkdir(exist_ok=True);(root/'artifacts/source-parity-result.json').write_text(json.dumps(result,indent=2))
print('Original handoff, public assets and styles verified with documented narrow-grid correction')
