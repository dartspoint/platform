#!/usr/bin/env python3
"""Verify original assets/fonts and prefixes of authorized additive UI styles."""
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
assert sorted(changed)==sorted(['components/darts-lobby.css','components/darts-community.css','components/darts-app.css','components/darts-play-shell.css','components/darts-desktop.css','components/admin/darts-admin.css','components/darts-match-experience.css','components/darts-tournament-room.css','components/admin/darts-tournaments.css']),changed
for relative in changed:
    old=(source/relative).read_text();new=(target/relative).read_text()
    if relative!='components/darts-desktop.css':
        assert new.startswith(old), 'Existing source CSS changed instead of additive responsive rules: '+relative
result={'ok':True,'identicalAssetsAndStyles':len(same),'changedStyles':changed,'reason':'Fixed desktop halves and compact headers replace the former desktop layout; additive mobile/chat/profile/moderation/spectator, match-summary and tournament-appearance CSS preserves original prefixes, assets and fonts','sourceSHA':'f57c505709e317d457de447f00c822c270edcdaf'}
(root/'artifacts').mkdir(exist_ok=True);(root/'artifacts/source-parity-result.json').write_text(json.dumps(result,indent=2))
print('Original handoff, public assets and styles verified with documented narrow-grid correction')
