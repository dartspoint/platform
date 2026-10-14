#!/usr/bin/env python3
"""Bounded, numeric-only snapshots of the current process's visible cgroup ancestors.

This is called outside the normal input measurement. It reads no sibling groups,
process arguments or environment, and it does not attribute a delay to a scheduler.
"""
import datetime
import math
import os
from pathlib import Path, PurePosixPath
import re
import stat
import time

MAX_DEPTH = 16
MAX_READ_BYTES = 262144
CGROUP_MOUNT = Path('/sys/fs/cgroup')
CPU_STAT_FIELDS = ('usage_usec', 'user_usec', 'system_usec', 'nr_periods',
                   'nr_throttled', 'throttled_usec', 'nr_bursts', 'burst_usec')
UINT64_MAX = (1 << 64) - 1


class Refused(Exception):
    pass


def _read(path, limit=8192):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(descriptor, 'rb') as source:
        value = source.read(limit + 1)
    if len(value) > limit:
        raise Refused('read_bound_exceeded')
    return value.decode('ascii')


def _integer(value, minimum=0, maximum=UINT64_MAX):
    if not re.fullmatch(r'[0-9]{1,20}', value):
        raise Refused('numeric_field_invalid')
    number = int(value)
    if number < minimum or number > maximum:
        raise Refused('numeric_field_invalid')
    return number


def _mount_field(value):
    # mountinfo escapes only these four characters; reject unexpected escapes.
    escapes = {r'\040': ' ', r'\011': '\t', r'\012': '\n', r'\134': '\\'}
    decoded = re.sub(r'\\[0-7]{3}', lambda item: escapes.get(item[0], '\0'), value)
    if '\0' in decoded or '\\' in decoded:
        raise Refused('mount_mapping_invalid')
    return decoded


def _current_root():
    rows = _read(Path('/proc/self/cgroup')).strip().splitlines()
    if len(rows) != 1 or not rows[0].startswith('0::/'):
        raise Refused('cgroup_v2_unavailable')
    location = PurePosixPath(rows[0][3:])
    if not location.is_absolute() or '..' in location.parts:
        raise Refused('cgroup_scope_invalid')
    matches = []
    for line in _read(Path('/proc/self/mountinfo'), MAX_READ_BYTES).splitlines():
        left, separator, right = line.partition(' - ')
        fields, filesystem = left.split(), right.split()
        if not separator or len(fields) < 6 or len(filesystem) < 3:
            raise Refused('mount_mapping_invalid')
        if filesystem[0] == 'cgroup2' and _mount_field(fields[4]) == str(CGROUP_MOUNT):
            matches.append(_mount_field(fields[3]))
    # The QA host uses a full cgroup2 mount. Do not guess a namespace/submount
    # mapping or infer parents hidden outside the current visible mount.
    if matches != ['/']:
        raise Refused('mount_mapping_unsupported')
    mount_metadata = CGROUP_MOUNT.lstat()
    if stat.S_ISLNK(mount_metadata.st_mode) or not stat.S_ISDIR(mount_metadata.st_mode):
        raise Refused('mount_mapping_invalid')
    current = CGROUP_MOUNT.joinpath(*location.parts[1:])
    if current.resolve(strict=True) != current or not current.is_dir():
        raise Refused('cgroup_scope_invalid')
    if not (CGROUP_MOUNT / 'cgroup.controllers').is_file():
        raise Refused('cgroup_v2_unavailable')
    return current


def _cpu_max(path):
    fields = _read(path).split()
    if len(fields) != 2:
        raise Refused('numeric_field_invalid')
    return {'unlimited': fields[0] == 'max',
            'quotaUs': None if fields[0] == 'max' else _integer(fields[0], 1),
            'periodUs': _integer(fields[1], 1, 1000000000)}


def _cpu_stat(path):
    values = {}
    for line in _read(path).splitlines():
        fields = line.split()
        if len(fields) != 2:
            raise Refused('numeric_field_invalid')
        if fields[0] in CPU_STAT_FIELDS:
            if fields[0] in values:
                raise Refused('numeric_field_invalid')
            values[fields[0]] = _integer(fields[1])
    return values


def _pressure(path):
    result = {}
    for line in _read(path).splitlines():
        fields = line.split()
        if not fields or fields[0] not in ('some', 'full') or fields[0] in result:
            raise Refused('numeric_field_invalid')
        parts = {}
        for field in fields[1:]:
            name, separator, value = field.partition('=')
            if not separator or name not in ('avg10', 'avg60', 'avg300', 'total') or name in parts:
                raise Refused('numeric_field_invalid')
            if name == 'total':
                parts[name] = _integer(value)
            else:
                number = float(value)
                if not math.isfinite(number) or not 0 <= number <= 100:
                    raise Refused('numeric_field_invalid')
                parts[name] = number
        if set(parts) != {'avg10', 'avg60', 'avg300', 'total'}:
            raise Refused('numeric_field_invalid')
        result[fields[0]] = parts
    return result


def _cpuset_count(path):
    value = _read(path).strip()
    if not value:
        return 0
    count, previous = 0, -1
    for part in value.split(','):
        bounds = part.split('-')
        if len(bounds) not in (1, 2):
            raise Refused('numeric_field_invalid')
        low = _integer(bounds[0], 0, 1048575)
        high = _integer(bounds[-1], low, 1048575)
        if low <= previous:
            raise Refused('numeric_field_invalid')
        count += high - low + 1
        if count > 4096:
            raise Refused('cpuset_bound_exceeded')
        previous = high
    return count


def snapshot():
    """Return depth-labelled public numeric metadata; failures contain no paths."""
    started = time.monotonic_ns()
    result = {'schemaVersion': 1, 'status': 'unavailable',
              'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'startedMonotonicNs': started, 'endedMonotonicNs': None,
              'maxDepth': MAX_DEPTH, 'reachedVisibleMountRoot': False,
              'truncated': False, 'ancestors': [],
              'scope': 'current_process_visible_mount_ancestors_only',
              'causalAttribution': False}
    try:
        current = _current_root()
        for depth in range(MAX_DEPTH):
            at_mount = current == CGROUP_MOUNT
            row = {'depth': depth, 'atVisibleMountRoot': at_mount, 'readErrors': {}}
            readers = (('cpuWeight', 'cpu.weight', lambda path: _integer(_read(path).strip(), 1, 10000)),
                       ('cpuMax', 'cpu.max', _cpu_max),
                       ('cpuStat', 'cpu.stat', _cpu_stat),
                       ('cpuPressure', 'cpu.pressure', _pressure),
                       ('cpusetCount', 'cpuset.cpus.effective', _cpuset_count))
            for category, filename, reader in readers:
                try:
                    row[category] = reader(current / filename)
                except FileNotFoundError:
                    row[category] = None
                    row['readErrors'][category] = 'not_available'
                except (OSError, ValueError, Refused):
                    row[category] = None
                    row['readErrors'][category] = 'read_or_numeric_validation_failed'
            result['ancestors'].append(row)
            if at_mount:
                result['reachedVisibleMountRoot'] = True
                break
            current = current.parent
        result['truncated'] = not result['reachedVisibleMountRoot']
        result['status'] = 'ok'
    except Refused as error:
        result['category'] = str(error)
    except (OSError, ValueError):
        result['category'] = 'snapshot_unavailable'
    finally:
        result['endedMonotonicNs'] = time.monotonic_ns()
    return result
