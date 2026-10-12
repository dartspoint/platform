#!/usr/bin/env python3
"""Start a disposable own Supabase project; verify CLI does not own app migrations."""
import json, os, re, shutil, subprocess, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory(prefix='dartspoint-bootstrap-qa-') as directory:
    root=Path(directory);shutil.copytree('supabase',root/'supabase',ignore=shutil.ignore_patterns('.temp','.branches'))
    config=root/'supabase/config.toml';text=config.read_text().replace('dartspoint-development','dartspoint-bootstrap-qa')
    text=re.sub(r'\b624(\d\d)\b',r'626\1',text);config.write_text(text)
    log=Path('artifacts/bootstrap-private.log');log.parent.mkdir(exist_ok=True)
    try:
        with log.open('wb') as output:
            result=subprocess.run([str(Path('node_modules/.bin/supabase').resolve()),'start','--workdir',directory,'--exclude','studio,imgproxy,edge-runtime,logflare,vector,supavisor'],stdout=output,stderr=subprocess.STDOUT)
        log.chmod(0o600)
        if result.returncode:raise RuntimeError('Disposable local bootstrap failed; inspect private diagnostics')
        query=subprocess.run(['docker','exec','supabase_db_dartspoint-bootstrap-qa','psql','-U','postgres','-At','-c',"select to_regclass('public.profiles') is null;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        if query.returncode or query.stdout.strip()!='t':raise RuntimeError('CLI unexpectedly applied app migrations')
        Path('artifacts/bootstrap-result.json').write_text(json.dumps({'ok':True,'freshProviderStarted':True,'checksummedRunnerOwnsAppMigrations':True}))
        print('Fresh local Supabase start leaves application migrations to the checksum runner')
    finally:
        subprocess.run([str(Path('node_modules/.bin/supabase').resolve()),'stop','--workdir',directory,'--no-backup'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
