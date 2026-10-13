#!/usr/bin/env python3
"""TARGET single-game-process deployment. Never force-stop an active match."""
import argparse, contextlib, datetime as dt, fcntl, json, os, re, subprocess, sys, time, urllib.request
from deployment_config import ROOT, CONFIG, MANAGED, PRIVATE_FIELDS, ports, read_env
from pathlib import Path

os.umask(0o077)

def release_path(value):
    p = Path(value).resolve(strict=True)
    if not re.fullmatch(r"/srv/dartspoint/(staging|production)/releases/[0-9a-f]{40}-[0-9]+-[0-9]+", str(p)):
        raise ValueError("Invalid release directory")
    return p

def meta(release):
    return json.loads((release / "release.json").read_text())

def run(args, release):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    diagnostic = result.stdout
    for path in release.glob('*.env'):
        for key, value in read_env(path).items():
            if key in PRIVATE_FIELDS and value: diagnostic = diagnostic.replace(value, '[redacted]')
    with open(release / "operations.log", "a", encoding="utf-8") as log:
        log.write(diagnostic)
    if result.returncode:
        raise RuntimeError("Operation failed; inspect owner-only operations.log on the VPS")
    return result.stdout

def compose(release, *args):
    return run(["docker", "compose", "--env-file", str(release / "deploy.env"), "-f", str(CONFIG / meta(release)["environment"] / "compose.yml"), *args], release)

def token(release):
    # Compare private current/next tokens to reject an uncoordinated rotation.
    for line in (release / "realtime.env").read_text().splitlines():
        if line.startswith("INTERNAL_DEPLOY_TOKEN="):
            return line.split("=", 1)[1]
    raise RuntimeError("Release has no deploy control token")

def control(release, action):
    if action not in ("status", "drain", "resume"):
        raise ValueError("Unknown control action")
    # Execute inside the current realtime container: true loopback, no bridge exception.
    # The token is read by Node from its private runtime environment, never argv/stdout.
    code = """const action=process.argv[1];fetch('http://127.0.0.1:2567/internal/deploy/'+action,{method:action==='status'?'GET':'POST',headers:{Authorization:'Bearer '+process.env.INTERNAL_DEPLOY_TOKEN},signal:AbortSignal.timeout(8000)}).then(async r=>{if(!r.ok)process.exit(1);console.log(JSON.stringify(await r.json()));}).catch(()=>process.exit(1));"""
    return json.loads(compose(release, "exec", "-T", "realtime", "node", "-e", code, action))

def drain(release, seconds):
    control(release, "drain")
    deadline = time.monotonic() + seconds
    print("New matches paused; waiting for all active games and committed throws to finish.", flush=True)
    while time.monotonic() < deadline:
        status = control(release, "status")
        zero = all(type(status.get(k)) is int and status[k] == 0 for k in ("activeMatches", "pendingImpacts", "pendingWrites"))
        if status.get("draining") is True and status.get("safeToStop") is True and zero:
            return
        time.sleep(5)
    raise RuntimeError("Drain deadline reached. Active games are not being terminated.")

def health(release):
    # Public response: minimal health/version only. Includes database/Redis readiness.
    expected = meta(release)["sha"]
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        try:
            for port in ports(meta(release)["environment"]):
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/readyz", timeout=5) as response:
                    status = json.load(response)
                if status.get("ok") is not True or status.get("release") != expected:
                    raise ValueError("Wrong release or not ready")
            # Compose healthchecks also cover worker heartbeat freshness.
            compose(release, "up", "-d", "--wait", "--wait-timeout", "60", "web", "realtime", "worker")
            return
        except Exception:
            time.sleep(3)
    raise RuntimeError("New release failed readiness; admissions remain paused")

def verify_backup(root, release):
    hook = MANAGED / 'backup-gate.py'
    if not hook.is_file() or hook.is_symlink() or hook.stat().st_uid != 0 or hook.stat().st_mode & 0o022:
        raise RuntimeError('Install the reviewed root-owned backup gate before deploying')
    # Hook must validate/create an off-host DB backup, not merely touch a marker.
    result = run(["python3", str(hook), str(release)], release)
    evidence = json.loads(result)
    now = dt.datetime.now(dt.timezone.utc)
    recent = lambda key, hours: 0 <= (now - dt.datetime.fromisoformat(evidence[key].replace("Z", "+00:00"))).total_seconds() <= hours * 3600
    if evidence.get("ok") is not True or evidence.get("environment") != meta(release)["environment"] or evidence.get("storage") != "offsite" or not recent("backupCompletedAt", 24) or not recent("restoreVerifiedAt", 24) or evidence.get("release") != meta(release)["sha"]:
        raise RuntimeError("Backup freshness / restore evidence gate failed")
    (release / "backup-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")

def verify_launch_storage(root, release):
    if meta(release)['environment'] != 'staging': return
    created = json.loads(compose(release, 'exec', '-T', 'worker', 'node', 'scripts/verify-launch-storage.mjs', 'create'))
    try:
        compose(release, 'restart', '--no-deps', 'web')
        health(release)
        recovered = json.loads(compose(release, 'exec', '-T', 'worker', 'node', 'scripts/verify-launch-storage.mjs', 'check'))
        if created != recovered or created.get('ok') is not True:
            raise RuntimeError('Signup did not survive web restart')
        verify_backup(root, release)
        counts = json.loads((release/'backup-evidence.json').read_text())['verifiedCounts']
        if counts.get('launchSubscriptions', 0) < 1 or counts.get('badLaunchTokens') != 0 or counts.get('launchPrivateAccessVerified') is not True:
            raise RuntimeError('Signup backup/restore isolation failed')
        (release/'launch-evidence.json').write_text(json.dumps({'ok': True, 'release': meta(release)['sha'], 'duplicateNormalizedEmailOnce': True, 'survivesWebRestart': True, 'offsiteRestoreVerified': True, 'anonymousAccessDenied': True})+'\n')
    finally:
        compose(release, 'exec', '-T', 'worker', 'node', 'scripts/verify-launch-storage.mjs', 'remove')

def verify_images(release):
    manifest = meta(release)
    # Digest references plus OCI revision/environment labels bind each actual pulled image.
    for service, image in manifest['images'].items():
        if not re.fullmatch(r'ghcr\.io/dartspoint/platform-'+manifest['environment']+'-'+service+r'@sha256:[0-9a-f]{64}', image):
            raise RuntimeError('Invalid image digest')
        actual = json.loads(run(['docker','image','inspect',image],release))[0]
        labels = actual['Config'].get('Labels', {})
        if (actual['Architecture'] != 'amd64' or actual['Os'] != 'linux' or image not in actual.get('RepoDigests',[]) or labels.get('org.opencontainers.image.revision') != manifest['sha'] or labels.get('nl.dartspoint.environment') != manifest['environment']):
            raise RuntimeError('Image platform or build provenance does not match release')

def verify_database(release):
    run(['docker','run','--rm','--cpus','0.5','--memory','256m','--pids-limit','128',
         '--env-file',str(release/'web.env'),meta(release)['images']['worker'],
         'node','scripts/verify-database.mjs'],release)

def activate_link(root, release):
    temporary = root / "current.next"
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(release)
    temporary.replace(root / "current")

def execute(release, rollback=False, drain_timeout=1200, locked=False):
    root = release.parent.parent
    if not 10 <= drain_timeout <= 1200:
        raise ValueError("Drain timeout must be 10..1200 seconds")
    with (contextlib.nullcontext() if locked else open(root / "deploy.lock", "a")) as lock:
        if not locked: fcntl.flock(lock, fcntl.LOCK_EX)
        current = release_path(root / "current") if (root / "current").is_symlink() else None
        if rollback and not current:
            raise RuntimeError("Rollback requires an existing active release")
        if not current and compose(release, "ps", "--all", "--quiet", "web", "realtime", "worker").strip():
            raise RuntimeError("Existing application containers without current release: operator inspection required")
        verify_images(release)
        if current and meta(current)["redisImage"] != meta(release)["redisImage"]:
            raise RuntimeError("Redis upgrades require a separate maintenance plan; keep its digest unchanged")
        verify_database(release)
        verify_backup(root, release)
        drained = False
        replaced = False
        committed = False
        try:
            if current:
                # Must match token across releases; rotate deliberately outside an active deploy.
                if token(current) != token(release):
                    raise RuntimeError("Deploy token rotation requires a separately reviewed maintenance step")
                drained = True
                drain(current, drain_timeout)
            else:
                # First bootstrap only; application startup defaults CLOSED until explicit resume.
                compose(release, "up", "-d", "--wait", "--wait-timeout", "60", "redis")
            if not rollback:
                try: compose(release, "run", "--rm", "--no-deps", "migrate")
                finally: (release / 'migration.env').unlink(missing_ok=True)
            replaced = True
            compose(release, "up", "-d", "--no-deps", "web", "realtime", "worker")
            health(release)
            if not rollback: verify_launch_storage(root, release)
            activate_link(root, release)
            committed = True
            control(release, "resume")
            if control(release, "status").get("draining") is not False:
                raise RuntimeError("New release did not reopen admissions")
            print("Deployment healthy. Release activated and admissions reopened.")
        except Exception:
            if committed:
                # Resume may have succeeded even if the HTTP response was lost.
                # Never roll back now without a fresh drain of the new release.
                print("Healthy new release retained. Check/resume admissions with control.py; do not force rollback.", file=sys.stderr)
                raise
            if current:
                if replaced:
                    # Only safe with the mandatory expand/contract migration policy.
                    compose(current, "up", "-d", "--no-deps", "web", "realtime", "worker")
                    health(current)
                if drained:
                    control(current, "resume")
                print("Previous release retained/restored; schema is never downgraded automatically.", file=sys.stderr)
            else:
                print("Bootstrap failed. Admissions remain closed; inspect the private host log.", file=sys.stderr)
            raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('release')
    parser.add_argument('--rollback',action='store_true',help='Operator only: activate a retained image, never downgrade the database')
    parser.add_argument('--drain-timeout',type=int,default=1200)
    args = parser.parse_args()
    execute(release_path(args.release), args.rollback, args.drain_timeout)

if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Deployment failed. Inspect the VPS; do not force-restart active games.", file=sys.stderr)
        sys.exit(1)
