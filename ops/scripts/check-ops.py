#!/usr/bin/env python3
"""Isolated behavioral verification. No Docker, network, VPS or real credentials."""
import ast, contextlib, importlib.util, io, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("deployment", HERE / "deploy.py")
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)
prep_spec = importlib.util.spec_from_file_location("prepare", HERE / "prepare-release.py")
prepare = importlib.util.module_from_spec(prep_spec)
prep_spec.loader.exec_module(prepare)

class DeploymentChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.old = self.root / "releases/old"
        self.new = self.root / "releases/new"
        for release in (self.old, self.new):
            release.mkdir(parents=True)
            (release / "release.json").write_text(json.dumps({"sha":release.name,"redisImage":"same","environment":"staging"}))
        (self.root / "current").symlink_to(self.old)
        self.events = []
        self.fail_at = None

    def tearDown(self):
        self.tmp.cleanup()

    def execute(self, rollback=False):
        def event(name, release):
            self.events.append((name, release.name))
            if self.fail_at == (name, release.name):
                raise RuntimeError("simulated failure")
        def compose(release, *args):
            event("migrate" if "migrate" in args else "containers", release)
            return ""
        def control(release, action):
            event(action, release)
            return {"draining":False}
        with patch.object(deployment, "release_path", side_effect=lambda p:Path(p).resolve()), \
             patch.object(deployment, "verify_images", side_effect=lambda p:event("images",p)), \
             patch.object(deployment, "verify_backup", side_effect=lambda root,p:event("backup",p)), \
             patch.object(deployment, "token", return_value="test-token"), \
             patch.object(deployment, "drain", side_effect=lambda p,t:event("drain",p)), \
             patch.object(deployment, "compose", side_effect=compose), \
             patch.object(deployment, "health", side_effect=lambda p:event("health",p)), \
             patch.object(deployment, "control", side_effect=control), \
             patch.object(deployment, "activate_link", side_effect=lambda root,p:event("activate",p)), \
             patch.object(sys, "argv", ["deploy.py",str(self.new)]+(["--rollback"] if rollback else [])), \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            deployment.main()

    def test_success_order(self):
        self.execute()
        for before, after in ((('drain','old'),('migrate','new')), (('migrate','new'),('containers','new')), (('health','new'),('activate','new')), (('activate','new'),('resume','new'))):
            self.assertLess(self.events.index(before),self.events.index(after))

    def test_drain_timeout_does_not_replace(self):
        self.fail_at=('drain','old')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertNotIn(('containers','new'),self.events)
        self.assertIn(('resume','old'),self.events)

    def test_migration_failure_retains_old(self):
        self.fail_at=('migrate','new')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertNotIn(('containers','new'),self.events)
        self.assertIn(('resume','old'),self.events)

    def test_health_failure_restores_old_before_resume(self):
        self.fail_at=('health','new')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertLess(self.events.index(('containers','old')),self.events.index(('health','old')))
        self.assertLess(self.events.index(('health','old')),self.events.index(('resume','old')))
        self.assertNotIn(('activate','new'),self.events)

    def test_uncertain_resume_never_replaces_potentially_active_games(self):
        self.fail_at=('resume','new')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertIn(('activate','new'),self.events)
        self.assertNotIn(('containers','old'),self.events)
        self.assertNotIn(('resume','old'),self.events)

    def test_rollback_still_drains_but_never_downgrades_schema(self):
        self.execute(rollback=True)
        self.assertIn(('drain','old'),self.events)
        self.assertNotIn(('migrate','new'),self.events)

    def test_unknown_bootstrap_containers_require_operator(self):
        (self.root/'current').unlink()
        with patch.object(deployment,"release_path",side_effect=lambda p:Path(p).resolve()), patch.object(deployment,"compose",return_value="existing-container"), patch.object(sys,"argv",["deploy.py",str(self.new)]):
            with self.assertRaisesRegex(RuntimeError,"operator inspection"):
                deployment.main()

class SerializationChecks(unittest.TestCase):
    def test_raw_values_and_owner_only_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/"runtime.env"
            value='test$not_shell="quotes"=keep'
            prepare.write_env(target,{"TEST_VALUE":value})
            self.assertEqual(target.read_text(),f"TEST_VALUE={value}\n")
            self.assertEqual(target.stat().st_mode & 0o777,0o600)

    def test_multiline_env_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                prepare.write_env(Path(folder)/"bad.env",{"TEST":"line1\nline2"})

    def test_required_values_fail_closed(self):
        for value in ("", "REPLACE_SECRET", "<secret>", "bad\nsecret"):
            with patch.dict(os.environ,{"EXAMPLE_SECRET":value}):
                with self.assertRaises(ValueError): prepare.required("EXAMPLE_SECRET")

    def test_public_url_rejects_credentials_query_ports_and_fragments(self):
        origin="https://"+"a"*20+".supabase.co"
        prepare.validate_supabase_url(origin)
        for candidate in (origin+"?key=private",origin+"#fragment",origin+":443",origin.replace("https://","https://private:secret@"),origin+"/path","https://evil.supabase.co.example.org"):
            with self.assertRaisesRegex(ValueError,"bare project HTTPS origin"):
                prepare.validate_supabase_url(candidate)

    def test_database_tls_is_exact_not_substring(self):
        base="postgresql://user:password@db.example.test:5432/postgres?"
        for query in ("sslmode=require","sslmode=verify-full&application_name=dartspoint"):
            prepare.validate_database_url("DATABASE_URL",base+query)
        for query in ("foo=sslmode=require","sslmode=require&sslmode=disable","sslmode=disable","sslmode=", "SSLMODE=require"):
            with self.assertRaisesRegex(ValueError,"exactly one required TLS mode"):
                prepare.validate_database_url("DATABASE_URL",base+query)

    def test_parser_failure_never_echoes_secret(self):
        sensitive="do-not-print-secret"
        for candidate in (f"postgresql://user:{sensitive}@host:invalid/postgres?sslmode=require",f"postgresql://user:{sensitive}@ho／st/postgres?sslmode=require"):
            with self.assertRaises(ValueError) as raised:
                prepare.validate_database_url("DATABASE_URL",candidate)
            self.assertNotIn(sensitive,str(raised.exception))
        with self.assertRaises(ValueError) as raised:
            prepare.validate_supabase_url(f"https://user:{sensitive}@ho／st")
        self.assertNotIn(sensitive,str(raised.exception))

    def test_python_syntax(self):
        for path in HERE.glob("*.py"):
            ast.parse(path.read_text(),filename=str(path))

if __name__ == "__main__":
    unittest.main(verbosity=2)
