#!/usr/bin/env python3
import sys
sys.path.insert(0, '/usr/local/libexec/dartspoint')
from delivery import main
try: main()
except Exception: sys.exit('Private delivery failed; inspect environment deployment diagnostics')
