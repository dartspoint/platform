#!/usr/bin/env python3
"""Prune only expired, private DartsPoint operations logs in owned release directories."""
import datetime as dt, os, re, stat
from pathlib import Path
RELEASE=re.compile(r'[0-9a-f]{40}-[1-9][0-9]*-[1-9][0-9]*')
LOG=re.compile(r'operations(?:-([0-9]{4}-[0-9]{2}-[0-9]{2}))?\.log')
def prune(root,now=None):
    now=now or dt.datetime.now(dt.timezone.utc);cutoff=now-dt.timedelta(days=28);root=Path(root);directory=root/'releases';uid=os.getuid()
    info=directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=uid or info.st_mode&0o077:raise RuntimeError('Private application releases directory required')
    removed=0
    for release in directory.iterdir():
        if not RELEASE.fullmatch(release.name):continue
        info=release.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=uid or info.st_mode&0o077:continue
        for path in release.iterdir():
            match=LOG.fullmatch(path.name)
            if not match:continue
            info=path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=uid or info.st_nlink!=1 or info.st_mode&0o077:continue
            if match[1]:
                try:date=dt.datetime.strptime(match[1],'%Y-%m-%d').replace(tzinfo=dt.timezone.utc)
                except ValueError:continue
                expired=date<cutoff.replace(hour=0,minute=0,second=0,microsecond=0)
            else:expired=info.st_mtime<cutoff.timestamp()
            if expired:path.unlink();removed+=1
    return {'removedOperationsLogs':removed,'maximumLogRetentionDays':30,'pruneAfterDays':28}


def prune_runtime_logs(release):
    from deploy import compose,meta
    if not meta(release).get('retainedLogs'):return {'runtimeLogPartitions':0,'featureAvailable':False}
    import json
    output=compose(release,'run','--rm','--no-deps','log-prune')
    receipts=[json.loads(line) for line in output.splitlines() if line.lstrip().startswith('{')]
    value=next((item for item in reversed(receipts) if set(item)=={'removedLogPartitions','pruneAfterDays','maximumRetentionDays'}),None)
    if not value or not isinstance(value['removedLogPartitions'],int) or value['removedLogPartitions']<0:raise RuntimeError('Runtime log prune returned no valid evidence')
    return {**value,'featureAvailable':True}
