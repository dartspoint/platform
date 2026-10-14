#!/usr/bin/env python3
"""Opt-in local QA input profile; upload only an authenticated encrypted archive."""
import base64
import hashlib
import importlib.util
import io
import json
import os
import re
import signal
import stat
import struct
import subprocess
import sys
import tarfile
import time
from pathlib import Path
from urllib.parse import urlsplit
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

BASE = Path('artifacts/qa-input-diagnostic')
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_FILES = 8192
MAGIC = b'DPQAIP1\n'
ROOT_FILES = {'runner-report.json', 'clock-bridge-private.json', 'runner-private.log', 'backend-report.json'}
NORMAL_PREFIXES = ('game-timing-', 'render-sample-', 'match-room-expansion-')
NORMAL_DIRECTORIES = ('workspace-chat', 'match-room-expansion-browser')


class Refused(Exception):
    pass


def require(condition, category):
    if not condition:
        raise Refused(category)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('ascii')


def public_key(encoded):
    require(isinstance(encoded, str) and 0 < len(encoded) <= 8192, 'public_key_invalid')
    try:
        der = base64.b64decode(encoded, validate=True)
        key = serialization.load_der_public_key(der)
        require(isinstance(key, rsa.RSAPublicKey) and key.key_size == 3072
                and key.public_numbers().e == 65537, 'public_key_invalid')
        require(key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo) == der,
                'public_key_not_spki')
    except Refused:
        raise
    except Exception:
        raise Refused('public_key_invalid') from None
    return key, hashlib.sha256(der).hexdigest()


def guarded_context():
    target = os.environ.get('DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET') or 'game'
    require(target in ('game', 'observer'), 'diagnostic_target_invalid')
    require(os.environ.get('DARTSPOINT_QA_INPUT_DIAGNOSTIC') == 'true'
            and os.environ.get('DARTSPOINT_QA_RUNNER') == 'true'
            and os.environ.get('GITHUB_EVENT_NAME') == 'push'
            and os.environ.get('GITHUB_REF') == 'refs/heads/main'
            and os.environ.get('DARTSPOINT_QA_INPUT_NORMAL_GAME_REACHED') == 'true', 'diagnostic_context_invalid')
    require(os.environ.get('DARTSPOINT_QA_INPUT_NORMAL_OBSERVER_REACHED', 'false') in ('true', 'false'),
            'diagnostic_observer_reached_invalid')
    spec = importlib.util.spec_from_file_location('qa_context', Path(__file__).with_name('qa-runner-context.py'))
    qa = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qa)
    qa.context()
    sha = os.environ.get('GITHUB_SHA', '')
    require(bool(re.fullmatch('[a-f0-9]{40}', sha))
            and qa.command(['git', 'rev-parse', 'HEAD']).decode().strip() == sha, 'diagnostic_source_invalid')
    run, attempt = os.environ.get('GITHUB_RUN_ID', ''), os.environ.get('GITHUB_RUN_ATTEMPT', '')
    require(bool(re.fullmatch('[1-9][0-9]{0,19}', run))
            and bool(re.fullmatch('[1-9][0-9]{0,7}', attempt)), 'diagnostic_run_invalid')
    original = os.environ.get('DARTSPOINT_QA_INPUT_NORMAL_EXIT_CODE', '')
    require(bool(re.fullmatch('[0-9]{1,3}', original)) and int(original) <= 255, 'diagnostic_original_exit_invalid')
    return {'schema': 1, 'repository': 'dartspoint/platform', 'sha': sha,
            'runId': run, 'runAttempt': attempt}, int(original)


def private_file(path):
    value = path.lstat()
    require(stat.S_ISREG(value.st_mode) and value.st_uid == os.getuid() and value.st_nlink == 1
            and not value.st_mode & 0o077 and path.resolve() == path.absolute(), 'private_file_invalid')
    return value


def local_environment():
    path = Path('.env.local').absolute()
    require(private_file(path).st_size <= 65536, 'local_environment_invalid')
    values = dict(line.split('=', 1) for line in path.read_text().splitlines()
                  if line and not line.startswith('#'))
    require(values.get('APP_ENV') == 'development', 'local_environment_invalid')
    for name in ('DATABASE_URL', 'MIGRATION_DATABASE_URL'):
        require(urlsplit(values.get(name, '')).hostname == '127.0.0.1', 'local_database_required')
    require(values.get('NEXT_PUBLIC_SUPABASE_URL') == 'http://127.0.0.1:62421'
            and values.get('NEXT_PUBLIC_APP_URL') == 'http://127.0.0.1:4300'
            and values.get('NEXT_PUBLIC_REALTIME_URL') == 'ws://127.0.0.1:42567'
            and values.get('REDIS_URL') == 'redis://127.0.0.1:62479', 'local_services_required')
    return values


def normal_snapshot():
    result = {}
    base = Path('artifacts').absolute()
    names = {entry.name for entry in base.iterdir()
             if entry.name.startswith(NORMAL_PREFIXES) or entry.name in NORMAL_DIRECTORIES}
    names.update(('game-timing-progress.json', 'game-timing-result.json', 'game-timing-debug-private.txt',
                  'render-sample-timing-progress.json', 'render-sample-timing-result.json',
                  'match-room-expansion-result.json', *NORMAL_DIRECTORIES))

    def visit(path):
        name = path.relative_to(base).as_posix()
        try:
            item = path.lstat()
        except FileNotFoundError:
            result[name] = None
            return
        require(not stat.S_ISLNK(item.st_mode) and item.st_uid == os.getuid(), 'normal_artifact_invalid')
        if stat.S_ISDIR(item.st_mode):
            result[name] = {'directory': True}
            for child in sorted(path.iterdir()):
                visit(child)
            return
        item = private_file(path.absolute())
        require(item.st_size <= 64 * 1024 * 1024, 'normal_artifact_bound_exceeded')
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for block in iter(lambda: source.read(65536), b''):
                digest.update(block)
        result[name] = {'bytes': item.st_size, 'sha256': digest.hexdigest()}
    for name in sorted(names):
        visit(base / name)
    return result


def run_child(private, environment):
    interrupted = []
    previous = {number: signal.getsignal(number) for number in (signal.SIGTERM, signal.SIGINT)}
    for number in previous:
        signal.signal(number, lambda received, _frame: interrupted.append(received))
    child = None
    started = time.monotonic()
    termination = None
    timed_out = False
    try:
        descriptor = os.open(private / 'runner-private.log', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'wb') as log:
            child = subprocess.Popen(['node', '--env-file=.env.local', '--import', 'tsx',
                                      'scripts/qa-input-diagnostic-runner.ts'], env=environment,
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            while True:
                code = child.poll()
                if code is not None:
                    return {'childExitCode': code if code >= 0 else 128 - code,
                            'timedOut': timed_out, 'interrupted': bool(interrupted)}
                now = time.monotonic()
                if termination is None and (interrupted or now - started >= 240):
                    timed_out = not interrupted
                    # Let the direct Node child close its own browser/match first.
                    try:
                        os.kill(child.pid, interrupted[0] if interrupted else signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    termination = now
                if termination is not None and now - termination >= 120:
                    # Only an unreaped live child still owns this newly created PG.
                    try:
                        os.killpg(child.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        raise Refused('diagnostic_child_cleanup_timeout') from None
                    return {'childExitCode': 124 if timed_out else 128 + interrupted[0],
                            'timedOut': timed_out, 'interrupted': bool(interrupted)}
                time.sleep(0.1)
    finally:
        try:
            if child is not None and child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=5)
                except (ProcessLookupError, subprocess.TimeoutExpired):
                    pass
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)


def archive_files(private):
    files = []
    total = 0
    for path in sorted(private.rglob('*')):
        relative = path.relative_to(private)
        require(all(re.fullmatch('[a-zA-Z0-9_.-]{1,160}', part) for part in relative.parts), 'archive_path_invalid')
        item = path.lstat()
        require(item.st_uid == os.getuid() and not item.st_mode & 0o077
                and not stat.S_ISLNK(item.st_mode), 'archive_owner_or_mode_invalid')
        if stat.S_ISDIR(item.st_mode):
            require(relative.parts[0] == 'sandbox', 'archive_directory_invalid')
            continue
        private_file(path.absolute())
        allowed = relative.as_posix() in ROOT_FILES or (
            len(relative.parts) >= 3 and relative.parts[:2] == ('sandbox', 'artifacts')
            and (path.suffix in ('.json', '.png', '.jpg', '.jpeg', '.log')
                 or path.name == 'game-timing-debug-private.txt'))
        require(allowed, 'archive_file_not_allowed')
        total += item.st_size
        files.append((path, relative.as_posix(), item))
        require(total <= MAX_ARCHIVE_BYTES and len(files) <= MAX_FILES, 'archive_bound_exceeded')
    require(files, 'archive_empty')
    return files


class EncryptedWriter(io.RawIOBase):
    def __init__(self, output, encryptor):
        self.output, self.encryptor, self.count = output, encryptor, 0

    def writable(self):
        return True

    def write(self, value):
        self.count += len(value)
        require(self.count <= MAX_ARCHIVE_BYTES, 'archive_bound_exceeded')
        self.output.write(self.encryptor.update(value))
        return len(value)


def encrypt_archive(private, destination, key, key_id, binding):
    files = archive_files(private)
    aes_key, iv = os.urandom(32), os.urandom(12)
    wrapped = key.encrypt(aes_key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    header = {**binding, 'keyId': key_id, 'cipher': 'AES-256-GCM', 'wrap': 'RSA-OAEP-SHA256',
              'archive': 'tar', 'iv': base64.b64encode(iv).decode(), 'wrappedKey': base64.b64encode(wrapped).decode()}
    encoded = canonical(header)
    require(len(encoded) <= 8192, 'encryption_header_invalid')
    encryptor = Cipher(algorithms.AES(aes_key), modes.GCM(iv)).encryptor()
    encryptor.authenticate_additional_data(encoded)
    temporary = destination.with_suffix('.partial')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(MAGIC + struct.pack('>I', len(encoded)) + encoded)
            stream = EncryptedWriter(output, encryptor)
            with tarfile.open(fileobj=stream, mode='w|', format=tarfile.PAX_FORMAT) as archive:
                for path, relative, observed in files:
                    source_fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                    with os.fdopen(source_fd, 'rb') as source:
                        current = os.fstat(source.fileno())
                        require(current.st_uid == os.getuid() and current.st_nlink == 1
                                and stat.S_ISREG(current.st_mode) and not current.st_mode & 0o077
                                and (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns)
                                == (observed.st_dev, observed.st_ino, observed.st_size, observed.st_mtime_ns),
                                'archive_file_changed')
                        info = tarfile.TarInfo(relative)
                        info.size, info.mode, info.mtime = current.st_size, 0o600, 0
                        archive.addfile(info, source)
            output.write(encryptor.finalize())
            output.write(encryptor.tag)
            output.flush()
            os.fsync(output.fileno())
        require(not destination.exists(), 'encrypted_artifact_exists')
        # Atomic no-replace publication: even a concurrent existing proof stays intact.
        os.link(temporary, destination, follow_symlinks=False)
        temporary.unlink()
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return stream.count


def main():
    if os.environ.get('DARTSPOINT_QA_INPUT_DIAGNOSTIC') != 'true':
        return 0
    os.umask(0o077)
    binding, original = guarded_context()
    key, key_id = public_key(os.environ.get('DARTSPOINT_QA_INPUT_PROFILE_PUBLIC_KEY_BASE64'))
    values = local_environment()
    before = normal_snapshot()
    base = BASE.absolute()
    require(base.parent.resolve() == base.parent, 'diagnostic_directory_invalid')
    base.mkdir(mode=0o700)
    private, encrypted = base / 'private', base / 'encrypted'
    private.mkdir(mode=0o700)
    encrypted.mkdir(mode=0o700)
    environment = {**os.environ, **values, 'DARTSPOINT_QA_INPUT_NORMAL_EXIT_CODE': str(original),
                   'DARTSPOINT_QA_INPUT_NORMAL_GAME_REACHED': 'true'}
    target = os.environ.get('DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET') or 'game'
    environment['DARTSPOINT_QA_INPUT_DIAGNOSTIC_TARGET'] = target
    for name in ('E2E_ORIGIN', 'E2E_STAGING_FIXTURE', 'E2E_STAGING_PROXY', 'DARTSPOINT_THROW_PROFILE'):
        environment.pop(name, None)
    capacity_spec = importlib.util.spec_from_file_location('qa_diagnostic_capacity',
                                                         Path(__file__).with_name('qa-input-diagnostic-capacity.py'))
    capacity = importlib.util.module_from_spec(capacity_spec)
    capacity_spec.loader.exec_module(capacity)
    capacity_before = capacity.snapshot()
    result = run_child(private, environment)
    capacity_after = capacity.snapshot()
    unchanged = normal_snapshot() == before
    infrastructure_ok = unchanged and not result['timedOut'] and not result['interrupted']
    try:
        report_path = private / 'runner-report.json'
        require(private_file(report_path).st_size <= 1024 * 1024, 'runner_report_invalid')
        report = json.loads(report_path.read_text())
        artifacts_before, artifacts_after = report.get('normalArtifactsBefore'), report.get('normalArtifactsAfter')
        artifact_schema_ok = isinstance(artifacts_before, list) and isinstance(artifacts_after, list) \
            and all(isinstance(entry, dict) and set(entry) == {'relativePath', 'sha256', 'bytes'}
                    and isinstance(entry['relativePath'], str)
                    and bool(re.fullmatch('[a-f0-9]{64}', entry['sha256']))
                    and type(entry['bytes']) is int and entry['bytes'] >= 0 for entry in artifacts_before)
        infrastructure_ok = infrastructure_ok and report.get('schemaVersion') == 1 \
            and report.get('diagnostic') is True and report.get('neverNormalAcceptance') is True \
            and report.get('normalOriginalExitCode') == original \
            and report.get('diagnosticTarget') == target \
            and report.get('normalObserverReached') is (os.environ.get('DARTSPOINT_QA_INPUT_NORMAL_OBSERVER_REACHED') == 'true') \
            and report.get('diagnosticExitCode') == result['childExitCode'] \
            and report.get('normalArtifactsUnchanged') is True \
            and artifact_schema_ok and artifacts_before == artifacts_after \
            and isinstance(report.get('normalPresenceBefore'), dict) \
            and report.get('normalPresenceBefore') == report.get('normalPresenceAfter') \
            and isinstance(report.get('cleanup'), dict) and report['cleanup'].get('ok') is True \
            and report.get('manualReviewRequired') is False and report.get('interrupted') is False
    except Exception:
        infrastructure_ok = False
    metadata = {**binding, **result, 'diagnostic': True, 'neverNormalAcceptance': True,
                'diagnosticTarget': target,
                'normalObserverReached': os.environ.get('DARTSPOINT_QA_INPUT_NORMAL_OBSERVER_REACHED') == 'true',
                'ongoingCapacityFileExcludedFromImmutableArtifactSnapshot': True,
                'visibleCgroupAncestorsBefore': capacity_before,
                'visibleCgroupAncestorsAfter': capacity_after,
                'normalOriginalExitCode': original, 'normalArtifactsUnchanged': unchanged,
                'infrastructureOk': infrastructure_ok, 'keyId': key_id}
    descriptor = os.open(private / 'backend-report.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(canonical(metadata) + b'\n')
    archive_bytes = encrypt_archive(private, encrypted / f'{binding["runId"]}-{binding["runAttempt"]}.enc',
                                    key, key_id, binding)
    print(json.dumps({'event': 'qa_input_diagnostic_encrypted', 'keyId': key_id,
                      'archiveBytes': archive_bytes, 'diagnosticExitCode': result['childExitCode'],
                      'normalArtifactsUnchanged': unchanged, 'infrastructureOk': infrastructure_ok}), flush=True)
    # A profiled timing failure is diagnostic evidence; it never replaces the
    # normal result. Privacy/encryption/cleanup/normal-artifact failures are hard.
    return 0 if infrastructure_ok else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Refused as error:
        print(json.dumps({'event': 'qa_input_diagnostic_failed', 'category': str(error)}), file=sys.stderr)
        raise SystemExit(1)
    except Exception:
        print(json.dumps({'event': 'qa_input_diagnostic_failed', 'category': 'diagnostic_unavailable'}), file=sys.stderr)
        raise SystemExit(1)
