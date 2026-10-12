#!/usr/bin/env python3
"""Read minimal local readiness. Does not reveal secrets or player data."""
import json, sys, urllib.request
expected = sys.argv[1] if len(sys.argv) > 1 else None
for name, port in (("web", 4300), ("realtime", 42567)):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/readyz", timeout=5) as response:
            data = json.load(response)
        if data.get("ok") is not True or (expected and data.get("release") != expected):
            raise ValueError()
        print(f"{name}: ready")
    except Exception:
        raise SystemExit(f"{name}: not ready")
