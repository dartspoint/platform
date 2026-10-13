#!/usr/bin/env python3
"""Fail closed on the dedicated QA account; never use a deployment/root daemon."""
import grp
import json
import os
import pwd
import re
import shutil
import socket
import stat
import subprocess
import sys
import tomllib
from pathlib import Path

QA_HOME = Path('/home/runner-qa')
WORKSPACE = QA_HOME / 'actions-runner/_work/platform/platform'
PROJECT = 'dartspoint-development'
REDIS = PROJECT + '-redis'
SUPABASE_LABEL = 'com.supabase.cli.project'
QA_LABEL = 'io.dartspoint.qa.project'
FORBIDDEN_GROUPS = {'sudo', 'docker', 'runner-staging', 'runner-production', 'dartspoint-staging', 'dartspoint-production'}


class Refused(Exception):
    """Only constant categories are reported, never subprocess diagnostics."""


def require(condition, category):
    if not condition:
        raise Refused(category)


def owned_directory(path, uid, private=False):
    item = path.lstat()
    require(stat.S_ISDIR(item.st_mode) and item.st_uid == uid and path.resolve() == path,
            'qa_directory_invalid')
    require(not item.st_mode & 0o022, 'qa_directory_writable_by_other')
    if private:
        require(not item.st_mode & 0o077, 'qa_directory_not_private')


def command(args, timeout=30):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout)
    require(result.returncode == 0, 'qa_command_failed')
    return result.stdout


def docker(*args, timeout=30):
    # Never inherit a Docker context that could redirect a cleanup command.
    uid = os.getuid()
    return command(['docker', '--host', f'unix:///run/user/{uid}/docker.sock',
                    '--config', str(QA_HOME / '.docker'), *args], timeout)


def own_subgid(gid, uid):
    # Rootless Docker maps namespace GID n>=1 through the daemon user's subgid
    # allocation. Trust only a bounded, root-owned regular allocation file.
    path = Path('/etc/subgid')
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == 0
            and not before.st_mode & 0o022, 'qa_subgid_file_invalid')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as source:
        item = os.fstat(source.fileno())
        require(stat.S_ISREG(item.st_mode) and item.st_uid == 0 and not item.st_mode & 0o022
                and (item.st_dev, item.st_ino) == (before.st_dev, before.st_ino),
                'qa_subgid_file_invalid')
        content = source.read(1024 * 1024 + 1)
    require(len(content) <= 1024 * 1024, 'qa_subgid_file_bound_exceeded')
    try:
        lines = content.decode('utf-8').splitlines()
    except UnicodeError:
        raise Refused('qa_subgid_file_invalid') from None
    ranges = []
    for line in lines:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        parts = line.split(':')
        require(len(parts) == 3 and bool(re.fullmatch(r'[a-zA-Z0-9_.-]+', parts[0]))
                and parts[1].isascii() and parts[1].isdigit()
                and parts[2].isascii() and parts[2].isdigit(), 'qa_subgid_entry_invalid')
        start, count = int(parts[1]), int(parts[2])
        require(0 < count <= 2**32 and 0 <= start < 2**32
                and start + count <= 2**32, 'qa_subgid_entry_invalid')
        own = parts[0] == 'runner-qa' or (parts[0].isascii() and parts[0].isdigit()
                                         and int(parts[0]) == uid)
        ranges.append((start, start + count, own))
    candidates = [(start, end) for start, end, own in ranges if own and start <= gid < end]
    for start, end in candidates:
        require(not any(not own and start < other_end and other_start < end
                        for other_start, other_end, own in ranges), 'qa_subgid_range_overlap')
    return bool(candidates)


def validate_socket(item, uid, primary_gid):
    primary = item.st_gid == primary_gid
    subordinate = False
    failure = None
    if not primary:
        try:
            subordinate = own_subgid(item.st_gid, uid)
        except Refused as error:
            failure = error
        except Exception:
            failure = Refused('qa_subgid_unavailable')
    # Always show bounded metadata, including successful mapped-GID validation.
    # No paths, account names, allocation contents, environment or daemon config.
    print(json.dumps({'event': 'qa_socket_metadata', 'isSocket': stat.S_ISSOCK(item.st_mode),
                      'uid': item.st_uid, 'gid': item.st_gid, 'mode': stat.S_IMODE(item.st_mode),
                      'expectedUid': uid, 'expectedPrimaryGid': primary_gid,
                      'ownerUidMatches': item.st_uid == uid, 'primaryGidMatches': primary,
                      'ownExclusiveSubgidMatches': subordinate, 'subgidChecked': not primary,
                      'subgidCheckFailed': failure is not None,
                      'otherPermissionsAbsent': not bool(item.st_mode & 0o007)}), flush=True)
    if failure:
        raise failure
    require(stat.S_ISSOCK(item.st_mode) and item.st_uid == uid and (primary or subordinate)
            and not item.st_mode & 0o007, 'qa_socket_invalid')


def context():
    require(os.environ.get('DARTSPOINT_QA_RUNNER') == 'true', 'qa_not_enabled')
    require(os.environ.get('GITHUB_REPOSITORY') == 'dartspoint/platform'
            and os.environ.get('GITHUB_EVENT_NAME') == 'push'
            and os.environ.get('GITHUB_REF') in ('refs/heads/main', 'refs/heads/staging'),
            'qa_untrusted_event')
    require(os.environ.get('RUNNER_ENVIRONMENT') == 'self-hosted'
            and os.environ.get('RUNNER_OS') == 'Linux' and os.environ.get('RUNNER_ARCH') == 'X64',
            'qa_runner_platform_invalid')
    account = pwd.getpwnam('runner-qa')
    uid = os.getuid()
    require(uid == os.geteuid() == account.pw_uid and uid >= 1000
            and uid not in (1001, 1002, 1003, 1004)
            and os.getgid() == account.pw_gid and account.pw_dir == str(QA_HOME), 'qa_account_invalid')
    groups = {grp.getgrgid(gid).gr_name for gid in os.getgroups()}
    require(not groups & FORBIDDEN_GROUPS, 'qa_privileged_group')
    require(os.environ.get('HOME') == str(QA_HOME), 'qa_home_invalid')
    require(os.environ.get('GITHUB_WORKSPACE') == str(WORKSPACE)
            and Path.cwd() == WORKSPACE, 'qa_workspace_invalid')
    for path in (QA_HOME, QA_HOME / 'actions-runner', QA_HOME / 'actions-runner/_work',
                 QA_HOME / 'actions-runner/_work/platform', WORKSPACE):
        owned_directory(path, uid)
    runtime = Path(f'/run/user/{uid}')
    owned_directory(runtime, uid, private=True)
    endpoint = runtime / 'docker.sock'
    item = endpoint.lstat()
    validate_socket(item, uid, account.pw_gid)
    require(os.environ.get('DOCKER_HOST') == 'unix://' + str(endpoint)
            and os.environ.get('XDG_RUNTIME_DIR') == str(runtime), 'qa_docker_endpoint_invalid')
    require(not any(os.environ.get(key) for key in ('DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH')),
            'qa_docker_override_refused')
    # Connecting to a Unix socket requires write permission; read is irrelevant.
    require(not os.access('/var/run/docker.sock', os.W_OK), 'qa_root_daemon_accessible')
    require(Path('/sys/fs/cgroup/cgroup.controllers').is_file(), 'qa_cgroup_v2_required')
    own_cgroup = Path('/proc/self/cgroup').read_text().strip().splitlines()
    require(len(own_cgroup) == 1 and own_cgroup[0].startswith('0::/')
            and f'user-{uid}.slice' in own_cgroup[0].split('/'), 'qa_cgroup_scope_invalid')
    info = json.loads(docker('info', '--format', '{{json .}}'))
    require('name=rootless' in info.get('SecurityOptions', [])
            and str(info.get('CgroupVersion')) == '2' and info.get('CgroupDriver') == 'systemd',
            'qa_rootless_cgroup_required')
    data = QA_HOME / '.local/share/docker'
    owned_directory(data, uid)
    require(info.get('DockerRootDir') == str(data), 'qa_docker_data_root_invalid')
    configuration = tomllib.loads((WORKSPACE / 'supabase/config.toml').read_text())
    require(configuration.get('project_id') == PROJECT, 'qa_supabase_project_invalid')
    return uid


def inventory(kind):
    key = {'container': 'ID', 'volume': 'Name', 'network': 'ID'}[kind]
    listing = docker(kind, 'ls', *(['--all'] if kind == 'container' else []), '--format', '{{json .}}')
    items = [json.loads(line) for line in listing.splitlines() if line]
    require(len(items) <= 200, 'qa_inventory_bound_exceeded')
    if not items:
        return []
    inspected = json.loads(docker(kind, 'inspect', *[item[key] for item in items]))
    selected = []
    for item in inspected:
        name = item['Name'].removeprefix('/')
        labels = (item.get('Config', {}).get('Labels') if kind == 'container' else item.get('Labels')) or {}
        # bind-local-services.py has one fixed rollback name if a previous job
        # was killed between replacing a container and removing its old copy.
        ending = r'(?:-loopback-old)?' if kind == 'container' else ''
        supabase_name = bool(re.fullmatch(r'supabase_[a-z0-9_]+_' + PROJECT + ending, name))
        tagged = labels.get(SUPABASE_LABEL) == PROJECT
        if supabase_name or tagged:
            require(supabase_name and tagged, 'qa_supabase_resource_scope_invalid')
            selected.append((item['Id'] if kind == 'container' else name, 'supabase'))
        if name == REDIS or labels.get(QA_LABEL) == PROJECT:
            require(kind == 'container' and name == REDIS and labels.get(QA_LABEL) == PROJECT
                    and labels.get('io.dartspoint.qa.resource') == 'redis', 'qa_redis_resource_scope_invalid')
            selected.append((item['Id'], 'redis'))
    return selected


def cleanup():
    context()
    # Validate the complete scope BEFORE asking the CLI to delete project volumes.
    resources = {kind: inventory(kind) for kind in ('container', 'volume', 'network')}
    cli = WORKSPACE / 'node_modules/.bin/supabase'
    failures = []
    if cli.exists():
        require(cli.resolve().is_relative_to(WORKSPACE / 'node_modules'), 'qa_cli_path_invalid')
        try:
            command([str(cli), 'stop', '--no-backup', '--project-id', PROJECT], timeout=120)
        except Exception:
            failures.append('qa_supabase_stop_failed')
    # A failed dependency install can leave no CLI. The same verified, exact
    # label+name scope also handles partial startup leftovers, never a prune.
    for kind in ('container', 'volume', 'network'):
        for resource, _ in inventory(kind):
            try:
                docker(kind, 'rm', *(['--force', '--volumes'] if kind == 'container' else []), resource)
            except Exception:
                failures.append('qa_resource_removal_failed')
    require(all(not inventory(kind) for kind in resources), 'qa_cleanup_incomplete')
    require(not failures, 'qa_cleanup_command_failed')


def preclean():
    cleanup()
    for port in (4300, 42567, 49443, 49444, 62420, 62421, 62422, 62423, 62424, 62429, 62479):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            # Closed Node/listener connections can retain TIME_WAIT. This still
            # refuses an active TCP LISTEN socket; it never enables SO_REUSEPORT.
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('127.0.0.1', port))
            except OSError:
                print(json.dumps({'event': 'qa_test_port_occupied', 'port': port}), flush=True)
                raise Refused('qa_test_port_occupied') from None


def public_template_bytes():
    content = command(['git', 'show', 'HEAD:supabase/templates/otp.html'])
    require(0 < len(content) <= 65536 and b'{{ .Token }}' in content, 'qa_public_template_invalid')
    return content


def prepare_template():
    uid = context()
    expected = public_template_bytes()
    path = WORKSPACE / 'supabase/templates/otp.html'
    before = path.lstat()
    require(path.resolve() == path and stat.S_ISREG(before.st_mode)
            and before.st_uid == uid and before.st_nlink == 1, 'qa_public_template_file_invalid')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as source:
        current = os.fstat(source.fileno())
        require(stat.S_ISREG(current.st_mode) and current.st_uid == uid and current.st_nlink == 1
                and (current.st_dev, current.st_ino) == (before.st_dev, before.st_ino),
                'qa_public_template_file_invalid')
        require(source.read(65537) == expected, 'qa_public_template_head_mismatch')
        # Only this public, HEAD-matched email template is read by Kong's
        # non-root UID through its bind mount. Private envfiles/homes stay intact.
        os.fchmod(source.fileno(), 0o644)
        after = os.fstat(source.fileno())
    print(json.dumps({'event': 'qa_public_template_prepared', 'uid': after.st_uid, 'gid': after.st_gid,
                      'previousMode': stat.S_IMODE(before.st_mode), 'mode': stat.S_IMODE(after.st_mode),
                      'headBytesMatch': True, 'tokenMacroPresent': True}), flush=True)


def template_probe():
    context()
    cli = WORKSPACE / 'node_modules/.bin/supabase'
    require(cli.resolve().is_relative_to(WORKSPACE / 'node_modules')
            and command([str(cli), '--version']).strip() == b'2.109.1', 'qa_template_cli_not_verified')
    expected = public_template_bytes()
    auth_name = 'supabase_auth_' + PROJECT
    item = json.loads(docker('container', 'inspect', auth_name))[0]
    require(item['Name'] == '/' + auth_name and item.get('Config', {}).get('Labels', {}).get(SUPABASE_LABEL) == PROJECT
            and item.get('State', {}).get('Running') is True, 'qa_template_auth_scope_invalid')
    health_command = item.get('Config', {}).get('Healthcheck', {}).get('Test', [])
    require('wget' in health_command and '--tries=1' in health_command,
            'qa_template_wget_not_verified')
    configured = dict(value.split('=', 1) for value in item.get('Config', {}).get('Env', [])
                      if value.startswith('GOTRUE_MAILER_TEMPLATES_') and '=' in value)
    for kind in ('confirmation', 'magic_link'):
        # These are the two configured public template URLs generated by the
        # reviewed CLI 2.109.1 start.go, never an arbitrary URL from an envfile.
        endpoint = f'http://supabase_kong_{PROJECT}:8088/email/{kind}.html'
        verified = configured.get('GOTRUE_MAILER_TEMPLATES_' + kind.upper()) == endpoint
        if not verified:
            print(json.dumps({'event': 'qa_public_template_probe', 'template': kind,
                              'endpointVerified': False, 'probeAttempted': False}), flush=True)
        require(verified, 'qa_template_endpoint_not_verified')
        try:
            result = subprocess.run(['docker', '--host', f'unix:///run/user/{os.getuid()}/docker.sock',
                                     '--config', str(QA_HOME / '.docker'), 'exec', auth_name,
                                     'wget', '-S', '-t', '1', '-T', '3', '-O', '-', endpoint],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=6)
        except subprocess.TimeoutExpired:
            print(json.dumps({'event': 'qa_public_template_probe', 'template': kind,
                              'endpointVerified': True, 'probeAttempted': True,
                              'timedOut': True}), flush=True)
            raise Refused('qa_template_probe_timeout') from None
        require(len(result.stdout) <= 65536 and len(result.stderr) <= 16384,
                'qa_template_probe_bound_exceeded')
        statuses = re.findall(rb'HTTP/\S+\s+(\d{3})', result.stderr)
        status_code = int(statuses[-1]) if statuses else None
        has_token = b'{{ .Token }}' in result.stdout
        same = result.stdout == expected
        print(json.dumps({'event': 'qa_public_template_probe', 'template': kind,
                          'endpointVerified': verified, 'probeAttempted': True, 'timedOut': False,
                          'wgetExitStatus': result.returncode,
                          'httpStatus': status_code, 'payloadBytes': len(result.stdout),
                          'payloadHasTokenPattern': has_token, 'headBytesMatch': same}), flush=True)
        require(result.returncode == 0 and status_code == 200 and has_token and same,
                'qa_public_template_not_served')


def browser_check():
    context()
    # Pinned Playwright's normal acceptance browser is headless_shell. Check
    # both downloaded executables without launching Chrome or installing apt packages.
    script = "const p=require('node:path');const r=require(p.join(p.dirname(require.resolve('playwright-core/package.json')),'lib/server/registry/index.js')).registry;console.log(JSON.stringify(['chromium','chromium-headless-shell'].map(n=>r.findExecutable(n).executablePath())));"
    paths = json.loads(command(['node', '-e', script]))
    require(len(paths) == 2, 'qa_browser_inventory_invalid')
    for value in paths:
        path = Path(value)
        require(path.is_absolute() and path.is_file() and path.resolve().is_relative_to(QA_HOME), 'qa_browser_path_invalid')
        result = command(['ldd', str(path)])
        require(b'not found' not in result, 'qa_browser_dependencies_missing')


def workspace_clean():
    cleanup()  # Docker cleanup MUST succeed before any workspace deletion.
    context()
    # Only this repository's exact, owned runner worktree. Symlinks are unlinked,
    # never traversed. No caches, runner install, Docker data or other apps.
    for item in WORKSPACE.iterdir():
        if item.is_symlink() or not item.is_dir():
            item.unlink()
        else:
            shutil.rmtree(item)


def main():
    operations = {'check': context, 'preclean': preclean, 'cleanup': cleanup,
                  'prepare-template': prepare_template, 'template-probe': template_probe,
                  'browser-check': browser_check, 'workspace-clean': workspace_clean}
    require(len(sys.argv) == 2 and sys.argv[1] in operations, 'qa_operation_invalid')
    operations[sys.argv[1]]()
    print(json.dumps({'event': 'qa_context_operation_complete', 'operation': sys.argv[1]}))


if __name__ == '__main__':
    try:
        main()
    except Refused as error:
        print(json.dumps({'event': 'qa_context_refused', 'category': str(error)}), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print(json.dumps({'event': 'qa_context_refused', 'category': 'qa_context_unavailable'}), file=sys.stderr)
        sys.exit(1)
