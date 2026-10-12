#!/usr/bin/env python3
"""Build the exact checked-out SHA with only public build-time settings."""
import json, os, re, subprocess, sys, tarfile
from pathlib import Path
os.umask(0o077)
release = Path(sys.argv[1]).resolve()
if not re.fullmatch(r"/opt/dartspoint/(staging|production)/releases/[0-9a-f]{40}-[0-9]+-[0-9]+", str(release)):
    raise SystemExit("Invalid release directory")
meta = json.loads((release / "release.json").read_text())
checkout = Path(meta["checkout"])
if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout, text=True).strip() != meta["sha"]:
    raise SystemExit("Checkout changed since release preparation")
if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=checkout, text=True).strip():
    raise SystemExit("Checkout is not clean; refuse to build uncommitted source")
if not (checkout / ".dockerignore").is_file():
    raise SystemExit("Copy and review ops/dockerignore.target as the repository .dockerignore first")
# Git archive excludes ignored/untracked runner leftovers from the Docker context.
# Public env stays in build args; runtime configuration is outside this archive.
context = release / "source"
context.mkdir(mode=0o700)
archive = release / "source.tar"
with archive.open("xb") as output:
    subprocess.run(["git", "archive", "--format=tar", meta["sha"]], cwd=checkout, stdout=output, check=True)
with tarfile.open(archive) as source:
    source.extractall(context, filter="data")
archive.unlink()
for service, image in meta["images"].items():
    args = ["docker", "build", "--file", "ops/Dockerfile.target", "--target", "runtime", "--tag", image,
            "--build-arg", f"NODE_IMAGE={meta['nodeImage']}", "--build-arg", f"SERVICE={service}",
            "--build-arg", f"GIT_SHA={meta['sha']}", "--build-arg", f"DEPLOY_ENV={meta['environment']}"]
    for key, value in meta["public"].items():
        args += ["--build-arg", f"{key}={value}"]
    subprocess.run(args + ["."], cwd=context, check=True)
image_ids = {service: subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", image], text=True).strip() for service, image in meta["images"].items()}
(release / "image-ids.json").write_text(json.dumps(image_ids, indent=2) + "\n")
print("Release images built and immutable image IDs recorded.")
