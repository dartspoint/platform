#!/usr/bin/env python3
"""Hosted preflight: report contract errors without printing configuration values."""
import os, sys
from deployment_config import SECRETS, VARIABLES, OPTIONAL, validate_values

def check(env, values):
    try:
        validate_values(env, values)
    except ValueError as error:
        # Contract validation messages contain fixed text and known field names only.
        print('Deployment configuration rejected: ' + str(error), file=sys.stderr)
        return 1
    except Exception:
        print('Deployment configuration rejected: invalid configuration contract', file=sys.stderr)
        return 1
    print('Deployment configuration contract passed; provider connectivity is checked on the VPS')
    return 0

if __name__ == '__main__':
    values = {name: os.environ.get(name, '') for name in SECRETS + VARIABLES + OPTIONAL}
    sys.exit(check(os.environ.get('DEPLOY_ENV', ''), values))
