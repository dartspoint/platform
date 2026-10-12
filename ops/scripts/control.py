#!/usr/bin/env python3
"""Operator recovery only: python3 ops/scripts/control.py /srv/dartspoint/<environment>/current status|drain|resume"""
import json, sys
from deploy import control, release_path
if len(sys.argv) != 3 or sys.argv[2] not in ("status", "drain", "resume"):
    raise SystemExit("Usage: control.py RELEASE status|drain|resume")
try:
    data = control(release_path(sys.argv[1]), sys.argv[2])
    # Emit only operational counters, never arbitrary server data.
    keys = ("draining", "activeMatches", "pendingImpacts", "pendingWrites", "safeToStop")
    print(json.dumps({key: data.get(key) for key in keys}))
except Exception:
    raise SystemExit("Control failed; inspect service health and private configuration on the host")
