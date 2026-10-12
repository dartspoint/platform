#!/usr/bin/env python3
"""Verify the unpacked handover without dependencies or network access."""
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent
errors = []
expected = set()
for line in (root / "SHA256SUMS.txt").read_text(encoding="utf-8").splitlines():
    match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
    if not match:
        errors.append("Invalid checksum line")
        continue
    digest, name = match.groups()
    relative = Path(name)
    if relative.is_absolute() or ".." in relative.parts or name in expected:
        errors.append("Unsafe or duplicate path: " + name)
        continue
    expected.add(name)
    path = root / relative
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root):
        errors.append("Missing or invalid file: " + name)
        continue
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        errors.append("Changed file: " + name)

manifest = json.loads((root / "MANIFEST.json").read_text(encoding="utf-8"))
source_files = manifest["source"]["files"]
for entry in source_files:
    path = root / "source-sites" / entry["path"]
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
        errors.append("Source mismatch: " + entry["path"])

actual = {p.relative_to(root).as_posix() for p in root.rglob("*")
          if p.is_file() and "__pycache__" not in p.parts and p.name != ".DS_Store"}
extra = actual - expected - {"SHA256SUMS.txt"}
if extra:
    errors.append("Unexpected files: " + ", ".join(sorted(extra)))
if errors:
    print("PACKAGE CHECK FAILED\n" + "\n".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"Package verified: {len(expected)} files; {len(source_files)} original source files.")
print("Source SHA: " + manifest["source"]["commit_sha"])
print("Checksums detect changes/corruption; they are not a digital signature.")
