#!/usr/bin/env python3
"""Operator readiness for an explicit environment and release."""
import json, sys, urllib.request
from deployment_config import environment, ports
if len(sys.argv)!=3: sys.exit('Usage: health.py staging|production SHA')
env = environment(sys.argv[1]); expected=sys.argv[2]
for name,port in zip(('web','realtime'),ports(env)):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/readyz',timeout=5) as response: data=json.load(response)
        if data.get('ok') is not True or data.get('release') != expected: raise ValueError()
        print(f'{name}: ready')
    except Exception: sys.exit(f'{name}: not ready')
