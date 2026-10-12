#!/usr/bin/env python3
"""TARGET scaffold. Materialize GitHub environment into private per-role files."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

os.umask(0o077)
def required(name):
    value = os.environ.get(name, "")
    if not value or any(c in value for c in "\r\n\0") or value.startswith(("REPLACE_", "<")):
        raise ValueError(f"Missing or invalid environment item: {name}")
    return value

def validate_supabase_url(value):
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme == "https" and re.fullmatch(r"[a-z0-9]{20}\.supabase\.co", parsed.hostname or "")
                 and parsed.username is None and parsed.password is None and parsed.port is None
                 and parsed.path in ("", "/") and not parsed.query and not parsed.fragment)
    except Exception:
        valid = False
    if not valid:
        raise ValueError("NEXT_PUBLIC_SUPABASE_URL must be the bare project HTTPS origin")

def validate_database_url(name, value):
    try:
        parsed = urlsplit(value)
        _ = parsed.port  # Validate port without ever printing a parser exception.
        query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
        valid = (parsed.scheme in ("postgres", "postgresql") and bool(parsed.hostname) and bool(parsed.username)
                 and not parsed.fragment and query.get("sslmode") in (["require"], ["verify-full"]))
    except Exception:
        valid = False
    if not valid:
        raise ValueError(f"{name} must be a valid Postgres URL with exactly one required TLS mode")

def write_env(path, values):
    # Compose format: raw: preserve $, quotes and = without shell evaluation.
    with open(path, "x", encoding="utf-8") as target:
        for key, value in values.items():
            if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or any(c in value for c in "\r\n\0"):
                raise ValueError("Unsupported environment serialization")
            target.write(f"{key}={value}\n")
    path.chmod(0o600)

def main():
    env = required("DEPLOY_ENV")
    if env not in ("staging", "production"):
        raise ValueError("Only staging or production deployment is allowed")
    sha = required("GITHUB_SHA")
    run_id = required("GITHUB_RUN_ID") + "-" + required("GITHUB_RUN_ATTEMPT")
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or not re.fullmatch(r"[0-9]+-[0-9]+", run_id):
        raise ValueError("Invalid release identity")
    checkout = Path.cwd().resolve()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if head != sha:
        raise ValueError("Checkout does not match the triggering commit")
    public = {k: required(k) for k in (
        "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_REALTIME_URL", "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY")}
    suffix = "staging.dartspoint.nl" if env == "staging" else "dartspoint.nl"
    if public["NEXT_PUBLIC_SITE_URL"] != f"https://{suffix}" or public["NEXT_PUBLIC_REALTIME_URL"] != f"https://realtime.{suffix}":
        raise ValueError("Origins do not match the selected environment")
    validate_supabase_url(public["NEXT_PUBLIC_SUPABASE_URL"])
    if not public["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].startswith("sb_publishable_"):
        raise ValueError("Use a Supabase publishable key, never a server secret")
    node_image, redis_image = required("NODE_IMAGE"), required("REDIS_IMAGE")
    for name, value in (("NODE_IMAGE", node_image), ("REDIS_IMAGE", redis_image)):
        if not re.fullmatch(r"[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}", value):
            raise ValueError(f"{name} must be pinned to a reviewed digest")
    secrets = {k: required(k) for k in (
        "SUPABASE_SECRET_KEY", "DATABASE_URL", "MIGRATION_DATABASE_URL", "RESEND_API_KEY", "INTERNAL_DEPLOY_TOKEN")}
    if not secrets["SUPABASE_SECRET_KEY"].startswith("sb_secret_"):
        raise ValueError("Use Supabase's server-only secret key")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43,}", secrets["INTERNAL_DEPLOY_TOKEN"]):
        raise ValueError("INTERNAL_DEPLOY_TOKEN must contain at least 32 random bytes encoded base64url")
    for name in ("DATABASE_URL", "MIGRATION_DATABASE_URL"):
        validate_database_url(name, secrets[name])
    root = Path("/opt/dartspoint") / env
    # The operator must provision a private, runner-owned environment directory first.
    if not root.is_dir() or root.is_symlink() or root.stat().st_mode & 0o077:
        raise ValueError("Provision /opt/dartspoint/<environment> with owner-only permissions first")
    release = root / "releases" / f"{sha}-{run_id}"
    release.mkdir(parents=True, mode=0o700, exist_ok=False)
    common = {
        "NODE_ENV": "production", "DEPLOY_ENV": env, "RELEASE_SHA": sha,
        "APP_ORIGIN": public["NEXT_PUBLIC_SITE_URL"],
        "REALTIME_PUBLIC_URL": public["NEXT_PUBLIC_REALTIME_URL"],
        "SUPABASE_URL": public["NEXT_PUBLIC_SUPABASE_URL"],
        "SUPABASE_PUBLISHABLE_KEY": public["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
        "REDIS_URL": "redis://redis:6379/0",
        "DATABASE_URL": secrets["DATABASE_URL"],
    }
    write_env(release / "web.env", {**common, **public, "SUPABASE_SECRET_KEY": secrets["SUPABASE_SECRET_KEY"]})
    write_env(release / "realtime.env", {**common, "INTERNAL_DEPLOY_TOKEN": secrets["INTERNAL_DEPLOY_TOKEN"]})
    write_env(release / "worker.env", {**common, "RESEND_API_KEY": secrets["RESEND_API_KEY"], "MAIL_FROM": required("MAIL_FROM"), "MAIL_REPLY_TO": required("MAIL_REPLY_TO")})
    write_env(release / "migration.env", {"NODE_ENV": "production", "DEPLOY_ENV": env, "DATABASE_URL": secrets["MIGRATION_DATABASE_URL"]})
    images = {service: f"dartspoint-{env}-{service}:{sha}-{run_id}" for service in ("web", "realtime", "worker")}
    write_env(release / "deploy.env", {"DEPLOY_ENV": env, "RELEASE_DIR": str(release), "REDIS_IMAGE": redis_image, **{key.upper() + "_IMAGE": value for key, value in images.items()}})
    metadata = {"environment": env, "sha": sha, "id": release.name, "checkout": str(checkout), "public": public, "nodeImage": node_image, "redisImage": redis_image, "images": images}
    (release / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")
    shutil.copyfile(checkout / "ops/compose.target.yml", release / "compose.yml")
    with open(required("GITHUB_OUTPUT"), "a", encoding="utf-8") as out:
        out.write(f"release={release}\n")
    print("Private release configuration prepared; no secret values emitted.")

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print arbitrary process output, URLs with credentials or their values.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print("Release preparation failed; inspect private host diagnostics.", file=sys.stderr)
        sys.exit(1)
