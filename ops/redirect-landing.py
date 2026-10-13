#!/usr/bin/env python3
"""Install only the temporary apex/www landing redirect in the host Caddyfile."""
import datetime
import fcntl
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

TARGET = Path('/etc/caddy/Caddyfile')
DOMAINS = ('dartspoint.nl', 'www.dartspoint.nl')
REDIRECT = 'dartspoint.nl, www.dartspoint.nl {\n    redir https://binnenkort.dartspoint.nl/ 302\n}\n'


def replacement(original):
    # Accept explicit, standalone headers only. Stop for human review if an
    # address is shared with another host, imported, or specified unusually.
    pattern = re.compile(r'(?m)^(?:dartspoint\.nl|www\.dartspoint\.nl)(?:\s*,\s*(?:dartspoint\.nl|www\.dartspoint\.nl))?\s*\{[ \t]*(?:#[^\n]*)?$')
    ranges = []
    for header in pattern.finditer(original):
        depth, quote, comment, escaped = 1, False, False, False
        start = original.index('{', header.start()) + 1
        for pos in range(start, len(original)):
            char = original[pos]
            if comment:
                if char == '\n': comment = False
                continue
            if escaped:
                escaped = False
                continue
            if quote and char == '\\':
                escaped = True
                continue
            if char == '"': quote = not quote
            if quote: continue
            if char == '#': comment = True
            elif char == '{': depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    ranges.append((header.start(), pos + 1))
                    break
        else:
            raise RuntimeError('Unbalanced Caddy block; no change made')
    if not ranges: raise RuntimeError('Expected apex site block not found; inspect Caddyfile manually')
    matched = '\n'.join(original[a:b] for a,b in ranges)
    if not re.search(r'(?<![\w.-])dartspoint\.nl(?![\w.-])', matched):
        raise RuntimeError('Apex block not found')
    remainder = original
    for a,b in reversed(ranges): remainder = remainder[:a] + remainder[b:]
    for domain in DOMAINS:
        if re.search(r'(?m)^[^#\n{}]*?(?<![\w.-])' + re.escape(domain) + r'(?![\w.-])[^#\n{}]*\{', remainder):
            raise RuntimeError('Domain also occurs in an unrecognized block header; inspect manually')
    # Substitute at the original first site position; other bytes are retained.
    result = original
    for index,(a,b) in reversed(list(enumerate(ranges))):
        result = result[:a] + (REDIRECT.rstrip() if index == 0 else '') + result[b:]
    return result


def atomic(data, mode):
    fd, name = tempfile.mkstemp(prefix='.dartspoint-redirect-', dir=TARGET.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chown(name, 0, 0)
        os.chmod(name, mode)
        os.replace(name, TARGET)
    finally:
        Path(name).unlink(missing_ok=True)


def main():
    if os.geteuid() != 0: raise RuntimeError('Execute as administrator')
    os.umask(0o077)
    lockfd = os.open('/run/dartspoint-caddy-redirect.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lockfd, 'r+') as lock:
        if not stat.S_ISREG(os.fstat(lockfd).st_mode) or os.fstat(lockfd).st_uid != 0:
            raise RuntimeError('Unexpected lock ownership')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        metadata = TARGET.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
            raise RuntimeError('Unexpected Caddyfile ownership or permissions')
        original = TARGET.read_bytes()
        updated = replacement(original.decode()).encode()
        fd, validation = tempfile.mkstemp(prefix='.dartspoint-redirect-validation-', suffix='.Caddyfile', dir=TARGET.parent)
        try:
            with os.fdopen(fd, 'wb') as stream: stream.write(updated)
            subprocess.run(['/usr/bin/caddy', 'validate', '--config', validation, '--adapter', 'caddyfile'], check=True)
        finally:
            Path(validation).unlink(missing_ok=True)
        if original == updated:
            print('Temporary apex/www landing redirect already installed')
            return
        backup_dir = Path('/var/backups/dartspoint-caddy-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        backup_dir.mkdir(mode=0o700)
        backup = backup_dir / 'Caddyfile'
        backup.write_bytes(original)
        mode = stat.S_IMODE(metadata.st_mode)
        try:
            atomic(updated, mode)
            subprocess.run(['/usr/bin/caddy', 'reload', '--config', str(TARGET), '--adapter', 'caddyfile'], check=True)
        except Exception:
            atomic(original, mode)
            subprocess.run(['/usr/bin/caddy', 'reload', '--config', str(TARGET), '--adapter', 'caddyfile'], check=False)
            raise
        print('Temporary 302 redirects installed for dartspoint.nl and www.dartspoint.nl')
        print('Private rollback backup: ' + str(backup))


if __name__ == '__main__': main()
