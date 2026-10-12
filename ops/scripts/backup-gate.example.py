#!/usr/bin/env python3
"""DELIBERATELY NOT A WORKING BACKUP PROVIDER.
Install a reviewed root-owned executable as:
  /usr/local/libexec/dartspoint/backup-gate.py (historical example only)
Accept argv environment + release SHA, authenticate to the selected backup
provider, create/check an encrypted OFF-HOST backup and verify actual evidence.
Success must print ONLY JSON with:
  ok=true, environment, storage='offsite', backupCompletedAt=<ISO UTC>,
  restoreVerifiedAt=<ISO UTC>, providerBackupId=<real immutable identifier>.
The deployment gate accepts backup age <=24h and restore drill age <=90 days.
A local dump alone or a manually invented marker is not sufficient.
Keep backup/provider credentials outside the Git repository and all artifacts.
"""
raise SystemExit("Backup provider integration not configured; refusing deployment")
