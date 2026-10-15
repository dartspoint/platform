#!/usr/bin/env python3
"""Isolated behavioral verification. No Docker, network, VPS or real credentials."""
import ast, contextlib, copy, importlib.util, io, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("deployment", HERE / "deploy.py")
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)
prep_spec = importlib.util.spec_from_file_location("prepare", HERE / "prepare-release.py")
prepare = importlib.util.module_from_spec(prep_spec)
prep_spec.loader.exec_module(prepare)
import deployment_config as config
import github_origin
import managed

def load_script(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),HERE/(name+'.py'))
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

installer=load_script('install-host')
configuration_check=load_script('check-delivery-config')

def fixture(env='staging'):
    pins=json.loads((HERE.parent/'image-pins.json').read_text())
    host='staging.dartspoint.nl' if env=='staging' else 'dartspoint.nl'
    values={'NEXT_PUBLIC_APP_URL':'https://'+host,'NEXT_PUBLIC_REALTIME_URL':'https://realtime.'+host,'NEXT_PUBLIC_SUPABASE_URL':'https://'+'a'*20+'.supabase.co','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':'sb_publishable_example','NEXT_PUBLIC_TURNSTILE_SITE_KEY':'site-key',
            'SUPABASE_SECRET_KEY':'sb_secret_example','RESEND_API_KEY':'example-private-mail','INTERNAL_DEPLOY_TOKEN':'x'*43,'RESTIC_PASSWORD':'example-strong-password','AWS_ACCESS_KEY_ID':'example-access','AWS_SECRET_ACCESS_KEY':'example-secret','MAIL_FROM':'DartsPoint <mail@example.test>','MAIL_REPLY_TO':'support@example.test','RESTIC_REPOSITORY':'s3:https://fsn1.your-objectstorage.com/dartspoint-'+env+'-backups','AWS_DEFAULT_REGION':'fsn1','DATABASE_CA_CERT_BASE64':'','LANDING_ORIGIN':'','TURNSTILE_SECRET_KEY':'test-private-captcha','RESEND_WEBHOOK_SECRET':'whsec_'+'a'*44,'SUPPORT_INBOUND_ADDRESS':'support@ontvangen.dartspoint.nl','SUPPORT_RESEND_DOMAIN_ID':'00000000-0000-4000-8000-000000000001','GOOGLE_AUTH_ENABLED':'false'}
    values['DATABASE_URL']='postgresql://postgres:example-password@db.'+'a'*20+'.supabase.co/postgres?sslmode=verify-full'
    manifest={'version':1,'environment':env,'sha':'a'*40,'run':'100','attempt':'1','repository':'dartspoint/platform','workflow':'.github/workflows/deploy.yml','platform':'linux/amd64','public':{k:values[k] for k in config.PUBLIC},'pins':pins,'images':{s:'ghcr.io/dartspoint/platform-'+env+'-'+s+'@sha256:'+'b'*64 for s in config.SERVICES},'builtAt':'2026-10-12T00:00:00+00:00'}
    return manifest,values,pins

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
        self.fail_backup_occurrence = None

    def tearDown(self):
        self.tmp.cleanup()

    def execute(self, rollback=False):
        def event(name, release):
            self.events.append((name, release.name))
            if self.fail_at == (name, release.name) or name=='backup' and self.events.count((name,release.name))==self.fail_backup_occurrence:
                raise RuntimeError("simulated failure")
        def compose(release, *args):
            event("migrate" if "migrate" in args else "containers", release)
            return ""
        def control(release, action):
            event(action, release)
            return {"draining":False}
        with patch.object(deployment, "release_path", side_effect=lambda p:Path(p).resolve()), \
             patch.object(deployment, "verify_images", side_effect=lambda p:event("images",p)), \
             patch.object(deployment, "verify_database", side_effect=lambda p:event("database",p)), \
             patch.object(deployment, "verify_backup", side_effect=lambda root,p:event("backup",p)), \
             patch.object(deployment, "verify_launch_storage", side_effect=lambda root,p:event("launch",p)), \
             patch.object(deployment, "token", return_value="test-token"), \
             patch.object(deployment, "drain", side_effect=lambda p,t:event("drain",p)), \
             patch.object(deployment, "compose", side_effect=compose), \
             patch.object(deployment, "health", side_effect=lambda p:event("health",p)), \
             patch.object(deployment, "control", side_effect=control), \
             patch.object(deployment, "activate_link", side_effect=lambda root,p:event("activate",p)), \
             patch.object(sys, "argv", ["deploy.py",str(self.new)]+(["--rollback"] if rollback else [])), \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            deployment.main()

    def test_old_release_rollback_does_not_start_unavailable_support_bundle(self):
        self.assertEqual(deployment.runtime_services(self.old),('web','realtime','worker'))
        value=json.loads((self.new/'release.json').read_text());value['supportRuntime']=True;(self.new/'release.json').write_text(json.dumps(value))
        self.assertEqual(deployment.runtime_services(self.new),('web','realtime','worker','support'))

    def test_success_order(self):
        self.execute()
        for before, after in ((('drain','old'),('migrate','new')), (('migrate','new'),('containers','new')), (('health','new'),('activate','new')), (('activate','new'),('resume','new'))):
            self.assertLess(self.events.index(before),self.events.index(after))

    def test_first_support_transition_verifies_expanded_backup_before_starting_apps(self):
        value=json.loads((self.new/'release.json').read_text());value['supportRuntime']=True;(self.new/'release.json').write_text(json.dumps(value))
        self.execute()
        backups=[index for index,event in enumerate(self.events) if event==('backup','new')]
        self.assertEqual(len(backups),2)
        self.assertLess(backups[0],self.events.index(('drain','old')))
        self.assertLess(self.events.index(('migrate','new')),backups[1])
        self.assertLess(backups[1],self.events.index(('containers','new')))

    def test_first_support_post_migration_backup_failure_retains_old_apps(self):
        value=json.loads((self.new/'release.json').read_text());value['supportRuntime']=True;(self.new/'release.json').write_text(json.dumps(value))
        self.fail_backup_occurrence=2
        with self.assertRaises(RuntimeError):self.execute()
        self.assertIn(('migrate','new'),self.events)
        self.assertNotIn(('containers','new'),self.events)
        self.assertIn(('resume','old'),self.events)
        self.assertNotIn(('activate','new'),self.events)

    def test_drain_timeout_does_not_replace(self):
        self.fail_at=('drain','old')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertNotIn(('containers','new'),self.events)
        self.assertIn(('resume','old'),self.events)

    def test_failed_backup_stops_before_drain_and_migration(self):
        self.fail_at=('backup','new')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertNotIn(('drain','old'),self.events)
        self.assertNotIn(('migrate','new'),self.events)
        self.assertNotIn(('containers','new'),self.events)

    def test_failed_application_role_gate_stops_before_backup(self):
        self.fail_at=('database','new')
        with self.assertRaises(RuntimeError): self.execute()
        self.assertNotIn(('backup','new'),self.events)

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

class DeploymentContractChecks(unittest.TestCase):
    def test_first_start_never_bootstraps_existing_or_unverifiable_database(self):
        from types import SimpleNamespace
        operator=load_script('operator-actions')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);release=root/'releases/first';release.mkdir(parents=True)
            with patch.object(operator,'read_env',return_value={}),patch.object(operator,'client',return_value=([],{})),patch.object(operator,'compose') as migrate:
                for result in (SimpleNamespace(returncode=0,stdout=b'false'),SimpleNamespace(returncode=1,stdout=b'')):
                    with patch.object(operator.subprocess,'run',return_value=result):
                        if result.returncode:
                            with self.assertRaises(RuntimeError):operator.bootstrap_first_database('staging',root,release)
                        else:self.assertFalse(operator.bootstrap_first_database('staging',root,release))
                    migrate.assert_not_called()
                (root/'database-bootstrapped.json').write_text('{}')
                self.assertFalse(operator.bootstrap_first_database('staging',root,release))
                migrate.assert_not_called()

    def test_first_start_retains_credentials_until_normal_migration_and_records_success_only(self):
        from types import SimpleNamespace
        operator=load_script('operator-actions')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);release=root/'releases/first';release.mkdir(parents=True)
            credential=release/'migration.env';credential.write_text('private-fixture')
            with patch.object(operator,'read_env',return_value={}),patch.object(operator,'client',return_value=([],{})),patch.object(operator.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'true')),patch.object(operator,'compose',side_effect=RuntimeError('migration failed')):
                with self.assertRaises(RuntimeError):operator.bootstrap_first_database('staging',root,release,keep_migration=True)
                self.assertFalse((root/'database-bootstrapped.json').exists())
            with patch.object(operator,'read_env',return_value={}),patch.object(operator,'client',return_value=([],{})),patch.object(operator.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=b'true')),patch.object(operator,'compose'):
                self.assertTrue(operator.bootstrap_first_database('staging',root,release,keep_migration=True))
            self.assertTrue(credential.exists())
            self.assertEqual(json.loads((root/'database-bootstrapped.json').read_text())['release'],'first')

    def test_first_repository_access_never_initializes_an_accessible_repository(self):
        from types import SimpleNamespace
        operator=load_script('operator-actions');_,values,_=fixture()
        with patch.object(operator,'read_env',return_value=values),patch.object(operator.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as restic:
            operator.ensure_backup_repository(Path('/unused'))
        self.assertEqual(restic.call_count,1)
        self.assertEqual(restic.call_args.args[0],['restic','snapshots','--json'])

    def test_existing_repository_wrong_password_refuses_first_start(self):
        from types import SimpleNamespace
        operator=load_script('operator-actions');_,values,_=fixture()
        with patch.object(operator,'read_env',return_value=values),patch.object(operator.subprocess,'run',side_effect=[SimpleNamespace(returncode=1),SimpleNamespace(returncode=1)]) as restic:
            with self.assertRaises(RuntimeError):operator.ensure_backup_repository(Path('/unused'))
        self.assertEqual(restic.call_count,2)

    def test_hosted_preflight_reports_settings_without_secret_values(self):
        _,values,_=fixture()
        sensitive='do-not-print-this-private-password'
        cases=[('RESTIC_PASSWORD', '', 'RESTIC_PASSWORD is missing or invalid'),
               ('INTERNAL_DEPLOY_TOKEN', sensitive, 'Deploy token needs'),
               ('DATABASE_URL', 'postgresql://app:'+sensitive+'@host:invalid/postgres?sslmode=require', 'DATABASE_URL must be'),
               ('SUPABASE_SECRET_KEY', sensitive, 'Server Supabase secret required'),
               ('DATABASE_CA_CERT_BASE64', sensitive, 'Invalid database CA certificate')]
        for name,value,expected in cases:
            with self.subTest(name=name),contextlib.redirect_stdout(io.StringIO()) as stdout,contextlib.redirect_stderr(io.StringIO()) as stderr:
                self.assertEqual(configuration_check.check('staging',{**values,name:value}),1)
                output=stdout.getvalue()+stderr.getvalue()
                self.assertIn(expected,output)
                self.assertNotIn(sensitive,output)
                self.assertNotIn(values['RESTIC_PASSWORD'],output)
        with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(configuration_check.check('staging',values),0)

    def test_hosted_preflight_suppresses_unexpected_exception_details(self):
        with patch.object(configuration_check,'validate_values',side_effect=RuntimeError('private-value')), contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.assertEqual(configuration_check.check('staging',{}),1)
        self.assertNotIn('private-value',stderr.getvalue())

    def test_environment_manifest_boundaries(self):
        for env in ('staging','production'):
            m,v,p=fixture(env);config.validate_manifest(m,env,p);config.validate_values(env,v)
            for key,value in (('environment','other'),('platform','linux/arm64'),('repository','other/platform'),('workflow','.github/workflows/ci.yml'),('sha','bad'),('run','1;evil')):
                bad=copy.deepcopy(m);bad[key]=value
                with self.assertRaises(ValueError):config.validate_manifest(bad,env,p)
            for image in ('ghcr.io/dartspoint/platform-'+env+'-web:latest','ghcr.io/evil/platform-web@sha256:'+'b'*64,'ghcr.io/dartspoint/platform-'+('production' if env=='staging' else 'staging')+'-web@sha256:'+'b'*64):
                bad=copy.deepcopy(m);bad['images']['web']=image
                with self.assertRaises(ValueError):config.validate_manifest(bad,env,p)

    def test_public_configuration_and_pins_fail_closed(self):
        m,v,p=fixture()
        for name,value in (('NEXT_PUBLIC_APP_URL','https://dartspoint.nl'),('NEXT_PUBLIC_REALTIME_URL','wss://realtime.staging.dartspoint.nl'),('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','sb_secret_private')):
            bad=copy.deepcopy(m);bad['public'][name]=value
            with self.assertRaises(ValueError):config.validate_manifest(bad,'staging',p)
        bad=copy.deepcopy(m);bad['pins']['REDIS_IMAGE']='redis:latest'
        with self.assertRaises(ValueError):config.validate_manifest(bad,'staging',p)

    def test_hetzner_region_repository_and_private_credentials(self):
        m,v,p=fixture()
        for name,value in (('AWS_DEFAULT_REGION','hel1'),('RESTIC_REPOSITORY','s3:http://fsn1.your-objectstorage.com/bucket'),('RESTIC_REPOSITORY','s3:https://secret:secret@fsn1.your-objectstorage.com/bucket'),('RESTIC_REPOSITORY','s3:https://127.0.0.1/bucket'),('RESTIC_REPOSITORY','s3:https://fsn1.your-objectstorage.com/bucket?password=secret')):
            bad={**v,name:value}
            with self.assertRaises(ValueError):config.validate_values('staging',bad)
        for name in set(config.SECRETS)-set(config.OPTIONAL_SECRETS):
            with self.assertRaises(ValueError):config.validate_values('staging',{**v,name:''})

    def test_support_optional_secrets_keep_classification_and_fail_closed_in_production(self):
        _,staging,_=fixture();_,production,_=fixture('production')
        disabled={**staging,**{name:'' for name in config.OPTIONAL_SECRETS},'SUPPORT_INBOUND_ADDRESS':'','SUPPORT_RESEND_DOMAIN_ID':''}
        config.validate_values('staging',disabled)
        for name in config.OPTIONAL_SECRETS:
            self.assertIn(name,config.PRIVATE_FIELDS)
            with self.assertRaises(ValueError):config.validate_values('production',{**production,name:''})
        for name,value in [('SUPPORT_INBOUND_ADDRESS','support@dartspoint.nl'),('SUPPORT_INBOUND_ADDRESS','https://secret@example.invalid'),('SUPPORT_RESEND_DOMAIN_ID','../../private'),('GOOGLE_AUTH_ENABLED','yes')]:
            with self.assertRaises(ValueError):config.validate_values('staging',{**staging,name:value})
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'releases').mkdir();manifest,values,_=fixture();release=prepare.prepare(manifest,values,root)
            web=config.read_env(release/'web.env');realtime=config.read_env(release/'realtime.env');worker=config.read_env(release/'worker.env');deploy=config.read_env(release/'deploy.env')
            for name in config.OPTIONAL_SECRETS:
                self.assertEqual(web[name],values[name]);self.assertNotIn(name,realtime);self.assertNotIn(name,worker)
            self.assertEqual(web['GOOGLE_AUTH_ENABLED'],'false');self.assertEqual(worker['CLAMAV_HOST'],'clamav');self.assertEqual(worker['CLAMAV_PORT'],'3310');self.assertIn('@sha256:',deploy['CLAMAV_IMAGE'])

    def test_support_host_update_is_staging_only_and_pins_cannot_upgrade_existing_images(self):
        path=HERE.parent/'update-support-host.template.py';spec=importlib.util.spec_from_file_location('support_host_update',path);host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
        staging=(HERE.parent/'Caddyfile.staging').read_text().replace(host.WEBHOOK_RULE,host.OUTSIDE)
        production=(HERE.parent/'Caddyfile.production').read_text()
        before=production+'\n# Existing countdown must remain byte-identical\ncountdown.example.invalid { respond 200 }\n'+staging
        after=host.staging_webhook(before)
        self.assertTrue(after.startswith(production+'\n# Existing countdown must remain byte-identical\ncountdown.example.invalid { respond 200 }\n'))
        start,end=host.staging_span(before);changed_start,changed_end=host.staging_span(after)
        self.assertEqual(before[:start],after[:changed_start]);self.assertEqual(before[end:],after[changed_end:])
        self.assertIn('not path /api/support/inbound',after);self.assertIn('not method POST',after);self.assertIn('respond @support_wrong_method 405',after)
        self.assertEqual(host.staging_webhook(after),after)
        with self.assertRaises(RuntimeError):host.staging_webhook(before.replace('100.64.0.0/10','0.0.0.0/0'))
        pins=fixture()[2];baseline={key:value for key,value in pins.items() if key!='CLAMAV_IMAGE'};host.validate_pins(baseline,pins)
        for name in baseline:
            changed={**pins,name:'changed'}
            with self.assertRaises(RuntimeError):host.validate_pins(baseline,changed)
        with self.assertRaises(RuntimeError):host.validate_pins(baseline,{**pins,'CLAMAV_IMAGE':'clamav/clamav:latest'})

    def test_support_host_update_accepts_only_the_same_whitespace_formatted_boundary(self):
        path=HERE.parent/'update-support-host.template.py';spec=importlib.util.spec_from_file_location('support_host_whitespace',path);host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
        old=(HERE.parent/'Caddyfile.staging').read_text().replace(host.WEBHOOK_RULE,host.OUTSIDE)
        old_start,old_end=host.staging_span(old);app=old[old_start:old_end]
        spaced=app.replace('    ','\t').replace('@outside not remote_ip','@outside\t not\tremote_ip').replace('respond @outside 403','respond\t@outside\t403').replace('reverse_proxy 127.0.0.1:3001','reverse_proxy\t127.0.0.1:3001')
        source='production.example.invalid { respond 200 }\n# Preserve all surrounding bytes\n'+spaced+old[old_end:]
        changed=host.staging_webhook(source);before_start,before_end=host.staging_span(source);after_start,after_end=host.staging_span(changed)
        self.assertEqual(source[:before_start],changed[:after_start]);self.assertEqual(source[before_end:],changed[after_end:]);self.assertEqual(host.staging_webhook(changed),changed)
        for unsafe in (spaced.replace('100.64.0.0/10','0.0.0.0/0'),spaced.replace('3001','3000'),spaced.replace('@outside\t403','@outside\t200'),spaced.replace('reverse_proxy\t127.0.0.1:3001','reverse_proxy\t127.0.0.1:3001 malicious.example.invalid')):
            with self.assertRaises(RuntimeError) as raised:host.staging_webhook(unsafe)
            diagnostic=str(raised.exception);self.assertNotIn('malicious.example.invalid',diagnostic);self.assertNotIn('0.0.0.0/0',diagnostic);self.assertIn('manual inspection',diagnostic)
        for unsafe in (changed.replace('not path /api/support/inbound','not path /api/support/*'),changed.replace('not method POST','not method GET'),changed.replace('respond @support_wrong_method 405','respond @support_wrong_method 200')):
            with self.assertRaises(RuntimeError):host.staging_webhook(unsafe)

    def test_support_host_update_preserves_only_the_known_stock_public_staging_site(self):
        path=HERE.parent/'update-support-host.template.py';spec=importlib.util.spec_from_file_location('support_host_public',path);host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
        source=(HERE.parent/'Caddyfile.staging').read_text().replace(host.WEBHOOK_RULE+'\n','').replace('    respond @outside 403\n','',1)
        start,end=host.staging_span(source);public=source[start:end];combined='production.example.invalid { respond 200 }\n'+source
        self.assertEqual(host.staging_configuration(combined),(combined,'public-preserved'))
        tabs=combined.replace(public,public.replace('    ','\t'))
        self.assertEqual(host.staging_configuration(tabs),(tabs,'public-preserved'))
        for unsafe in (public.replace('3001','3000'),public.replace('nosniff','unsafe-value'),public.replace('noindex, nofollow, noarchive','index, follow'),public.replace('encode zstd gzip','encode gzip'),public.replace('encode zstd gzip','encode zstd gzip\n    basic_auth { }'),public.replace('encode zstd gzip','encode zstd gzip\n    respond /custom 200')):
            with self.assertRaises(RuntimeError) as raised:host.staging_webhook(unsafe)
            self.assertNotIn('unsafe-value',str(raised.exception));self.assertNotIn('basic_auth',str(raised.exception))

    def test_support_compose_is_resource_bounded_and_scanner_has_no_host_access(self):
        import yaml
        services=yaml.safe_load((HERE.parent/'compose.target.yml').read_text())['services'];scanner=services['clamav'];support=services['support']
        self.assertEqual(scanner['user'],'100:101');self.assertEqual(scanner['mem_limit'],'3g');self.assertEqual(scanner['cap_drop'],['ALL']);self.assertNotIn('ports',scanner);self.assertNotIn('env_file',scanner)
        self.assertEqual(scanner['volumes'],['clamav-data:/var/lib/clamav']);self.assertIn('ConcurrentDatabaseReload no',scanner['command'][1])
        self.assertEqual(support['cpus'],0.25);self.assertEqual(support['mem_limit'],'384m');self.assertEqual(support['command'],['node','/app/retained-log.mjs','support','node','scripts/support-worker.mjs']);self.assertEqual(support['healthcheck']['test'],['CMD','node','scripts/support-health.mjs'])
        self.assertEqual(support['depends_on']['clamav']['condition'],'service_started')
        for name in ('web','realtime','worker','support'):
            self.assertEqual(services[name]['logging'],{'driver':'none'});self.assertEqual(services[name]['volumes'],['technical-logs:/var/log/dartspoint']);self.assertEqual(services[name]['command'][:2],['node','/app/retained-log.mjs'])
        self.assertNotIn('env_file',services['log-prune']);self.assertEqual(services['log-prune']['network_mode'],'none')

    def test_real_compose_merge_keeps_retained_images_runnable_without_log_launcher(self):
        if not shutil.which('docker'):self.skipTest('Docker CLI unavailable in this build stage; actual Compose merge runs on the host')
        version=subprocess.run(['docker','compose','version'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if version.returncode:self.skipTest('Docker Compose plugin unavailable in this build stage')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'releases').mkdir();manifest,values,pins=fixture();release=prepare.prepare(manifest,values,root)
            config_root=root/'config';(config_root/'staging').mkdir(parents=True)
            (config_root/'staging/compose.yml').write_text((HERE.parent/'compose.target.yml').read_text())
            (config_root/'image-pins.json').write_text(json.dumps(pins))
            with patch.object(deployment,'CONFIG',config_root):
                modern=json.loads(deployment.compose(release,'config','--format','json'))
                for name in ('web','realtime','worker'):
                    self.assertEqual(modern['services'][name]['command'][:3],['node','/app/retained-log.mjs',name])
                    self.assertEqual(modern['services'][name]['logging'],{'driver':'none'})
                    self.assertEqual(modern['services'][name]['volumes'][0]['target'],'/var/log/dartspoint')
                old_metadata=json.loads((release/'release.json').read_text());old_metadata.pop('retainedLogs');old_metadata.pop('supportRuntime');(release/'release.json').write_text(json.dumps(old_metadata))
                # Old deploy.env predates the scanner pin, as on the first rollout.
                deploy_values=config.read_env(release/'deploy.env');deploy_values.pop('CLAMAV_IMAGE');(release/'deploy.env').unlink();config.write_env(release/'deploy.env',deploy_values)
                legacy=json.loads(deployment.compose(release,'config','--format','json'))
                for name in ('web','realtime','worker'):
                    self.assertEqual(legacy['services'][name]['command'],['node','server.js'])
                    self.assertEqual(legacy['services'][name]['logging'],{'driver':'json-file','options':{'max-size':'10m','max-file':'3'}})
                    self.assertFalse(legacy['services'][name].get('volumes'))
                    self.assertEqual(legacy['services'][name]['image'],modern['services'][name]['image'])
                    if name!='worker':self.assertEqual(legacy['services'][name]['ports'],modern['services'][name]['ports'])
                self.assertEqual(deployment.runtime_services(release),('web','realtime','worker'))
                self.assertEqual(list(release.glob('.compose-legacy-*')),[])

    def test_log_retention_prunes_only_owned_expired_log_names_without_following_symlinks(self):
        import datetime as dt
        prune=load_script('log-retention').prune
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);releases=root/'releases';releases.mkdir(mode=0o700);release=releases/('a'*40+'-1-1');release.mkdir(mode=0o700)
            now=dt.datetime(2026,10,15,tzinfo=dt.timezone.utc)
            for name in ('operations-2026-09-01.log','operations-2026-10-15.log','operations.log','web.env','release.json'):
                file=release/name;file.write_text('private fixture');file.chmod(0o600)
            expired=release/'operations.log';os.utime(expired,(0,0));(release/'operations-2026-01-01.log').symlink_to(release/'web.env')
            result=prune(root,now)
            self.assertEqual(result['removedOperationsLogs'],2);self.assertTrue((release/'web.env').exists());self.assertTrue((release/'release.json').exists());self.assertTrue((release/'operations-2026-10-15.log').exists());self.assertTrue((release/'operations-2026-01-01.log').is_symlink())

    def test_single_login_adds_verified_tls_and_uses_session_port(self):
        _,values,_=fixture()
        canonical=values['DATABASE_URL']
        for url in (canonical,canonical.replace('verify-full','require'),canonical.split('?')[0],canonical.replace('.supabase.co/', '.supabase.co:6543/')):
            checked=config.validate_values('staging',{**values,'DATABASE_URL':url})
            self.assertEqual(checked['DATABASE_URL'],canonical if ':6543/' not in url else canonical.replace('.supabase.co/', '.supabase.co:5432/'))
            self.assertEqual(values['DATABASE_URL'],canonical)
        pooled=canonical.replace('postgres:', 'postgres.'+'a'*20+':').replace('db.'+'a'*20+'.supabase.co','aws-0-eu-central-1.pooler.supabase.com:6543')
        checked=config.validate_values('staging',{**values,'DATABASE_URL':pooled.split('?')[0]})
        self.assertEqual(checked['DATABASE_URL'],pooled.replace(':6543/', ':5432/'))

    def test_shared_login_does_not_accept_ambiguous_or_disabled_tls(self):
        _,values,_=fixture()
        base=values['DATABASE_URL'].split('?')[0]
        for query in ('sslmode=disable','sslmode=require&sslmode=verify-full','sslmode=require&sslrootcert=/unreviewed/path','sslmode='):
            with self.subTest(query=query),self.assertRaises(ValueError):
                config.validate_values('staging',{**values,'DATABASE_URL':base+'?'+query})

    def test_unknown_extension_metadata_cannot_reach_restore_sql(self):
        restore=load_script('restore-db')
        for extensions in ([{'name':'evil;drop schema auth','schema':'extensions','version':'1.0'}],[{'name':'pgcrypto','schema':'unreviewed','version':'1.3'}],[{'name':'pgcrypto','schema':'extensions','version':"1.3';evil"}]):
            with self.assertRaises(ValueError):restore.restore('/nonexistent.dump',fixture()[2]['POSTGRES_IMAGE'],extensions)

    def test_role_files_and_environment_ports_are_separated(self):
        for env in ('staging','production'):
            m,v,p=fixture(env)
            with tempfile.TemporaryDirectory() as folder:
                root=Path(folder);(root/'releases').mkdir()
                release=prepare.prepare(m,v,root)
                for service in config.SERVICES:
                    values=config.read_env(release/(service+'.env'))
                    self.assertEqual(values['DATABASE_URL'],v['DATABASE_URL'])
                    self.assertEqual(values['DATABASE_ROLE'],'dartspoint_app')
                    self.assertNotIn('MIGRATION_DATABASE_URL',values);self.assertNotIn('BACKUP_DATABASE_URL',values)
                    self.assertNotIn('RESTIC_PASSWORD',values);self.assertNotIn('AWS_SECRET_ACCESS_KEY',values)
                    if service!='worker':self.assertNotIn('RESEND_API_KEY',values)
                self.assertEqual(set(config.read_env(release/'migration.env')),{'NODE_ENV','APP_ENV','DEPLOY_ENV','MIGRATION_DATABASE_URL','DATABASE_CA_CERT_BASE64'})
                self.assertEqual(config.read_env(release/'migration.env')['MIGRATION_DATABASE_URL'],v['DATABASE_URL'])
                self.assertEqual(config.read_env(release/'backup.env')['BACKUP_DATABASE_URL'],v['DATABASE_URL'])
                self.assertEqual(config.read_env(release/'backup.env')['AWS_DEFAULT_REGION'],'fsn1')
                self.assertEqual(config.read_env(release/'deploy.env')['WEB_PORT'],str(config.ports(env)[0]))
                self.assertFalse((release/'compose.yml').exists())

    def test_libpq_mounts_real_host_trust_instead_of_assuming_image_ca(self):
        import postgres_client
        m,v,p=fixture();v['POSTGRES_IMAGE']=p['POSTGRES_IMAGE'];v['BACKUP_DATABASE_URL']=v['DATABASE_URL']
        with tempfile.TemporaryDirectory() as folder:
            args,env=postgres_client.client(v,folder)
            self.assertEqual(env['PGSSLMODE'],'verify-full')
            self.assertEqual(env['PGSSLROOTCERT'],'/tmp/database-ca.crt')
            self.assertIn('target=/tmp/database-ca.crt,readonly',' '.join(args))
            self.assertNotIn(env['PGPASSWORD'],' '.join(args))
            self.assertTrue((Path(folder)/'database-ca.crt').read_bytes().startswith(b'-----BEGIN CERTIFICATE-----'))

    def test_landing_origin_is_exact_separate_and_forwarded(self):
        m,v,p=fixture();v['LANDING_ORIGIN']='https://binnenkort.dartspoint.nl'
        config.validate_values('staging',v)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'releases').mkdir();release=prepare.prepare(m,v,root)
            self.assertEqual(config.read_env(release/'web.env')['LANDING_ORIGIN'],v['LANDING_ORIGIN'])
            self.assertEqual(config.read_env(release/'web.env')['TRUST_PROXY'],'caddy')
            self.assertEqual(config.read_env(release/'worker.env')['LANDING_ORIGIN'],v['LANDING_ORIGIN'])
        for origin in ('http://binnenkort.dartspoint.nl','https://staging.dartspoint.nl','https://binnenkort.dartspoint.nl/path','https://user@binnenkort.dartspoint.nl','https://binnenkort.dartspoint.nl?x=1'):
            with self.assertRaises(ValueError):config.validate_values('staging',{**v,'LANDING_ORIGIN':origin})

    def test_public_values_cannot_change_after_build(self):
        m,v,p=fixture();v['NEXT_PUBLIC_TURNSTILE_SITE_KEY']='changed-after-build'
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,'Build-time'):prepare.prepare(m,v,Path(folder))

    def test_cross_project_database_and_unknown_ports_are_rejected(self):
        m,v,p=fixture()
        for value in (v['DATABASE_URL'].replace('a'*20,'b'*20),v['DATABASE_URL'].replace('.supabase.co','.supabase.co:1234')):
            with self.assertRaises(ValueError):config.validate_values('staging',{**v,'DATABASE_URL':value})
        values={**v}
        values['DATABASE_URL']=values['DATABASE_URL'].replace(':example-password@', '.'+'a'*20+':example-password@').replace('db.'+'a'*20+'.supabase.co','aws-0-eu-central-1.pooler.supabase.com:5432')
        config.validate_values('staging',values)

    def test_stale_or_duplicate_runs_cannot_reverse_release_order(self):
        m,v,p=fixture()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);managed.reject_old(root,m)
            for run,attempt in (('99','5'),('100','1')):
                with self.assertRaises(ValueError):managed.reject_old(root,{**m,'run':run,'attempt':attempt})
            managed.reject_old(root,{**m,'attempt':'2'})
            managed.reject_old(root,{**m,'run':'101','attempt':'1'})

    def test_github_provenance_and_branch_head_are_verified(self):
        m,v,p=fixture()
        run={'event':'push','head_sha':m['sha'],'head_branch':'staging','run_attempt':1,'path':'.github/workflows/deploy.yml','head_repository':{'full_name':'dartspoint/platform'},'actor':{'login':'qa-fixture'}}
        jobs={'jobs':[{'name':n,'conclusion':'success'} for n in ('Verify / verify','Publish images')]}
        ref={'object':{'sha':m['sha']}}
        with patch.object(github_origin,'get',side_effect=[run,jobs,ref]):github_origin.verify(m,'example-token')
        for k,value in (('event','pull_request'),('head_sha','b'*40),('head_branch','production'),('path','.github/workflows/evil.yml'),('run_attempt',2)):
            with patch.object(github_origin,'get',return_value={**run,k:value}):
                with self.assertRaises(ValueError):github_origin.verify(m,'example-token')
        for data in ([run,{'jobs':[]}],[run,jobs,{'object':{'sha':'b'*40}}]):
            with patch.object(github_origin,'get',side_effect=data):
                with self.assertRaises(ValueError):github_origin.verify(m,'example-token')

    def test_entrypoint_refuses_arbitrary_arguments(self):
        for argv in (['managed.py'],['managed.py','staging','--shell'],['managed.py','../production']):
            with patch.object(sys,'argv',argv):
                with self.assertRaises(ValueError):managed.main()

    def test_private_handoff_rejects_symlinks_and_world_readable_files(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);spool=root/'staging';spool.mkdir();spool.chmod(0o750)
            private=spool/'pending.json';private.write_text(json.dumps({'manifest':{},'values':{},'registryToken':'example'}));private.chmod(0o640)
            with patch.object(managed,'SPOOL',root),patch.object(managed.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.getuid())):
                self.assertEqual(managed.pending('staging')['registryToken'],'example')
                private.chmod(0o644)
                with self.assertRaises(ValueError):managed.pending('staging')
                private.unlink();private.symlink_to('/etc/passwd')
                with self.assertRaises(OSError):managed.pending('staging')

    def test_exact_sudoers_are_validated_by_visudo(self):
        for env in ('staging','production'):
            text=installer.sudoers_rule(env)
            self.assertIn('ALL=(dartspoint-'+env+')',text);self.assertTrue(text.rstrip().endswith('""'))
            self.assertNotIn('(root)',text);self.assertNotIn('*',text)
            with tempfile.NamedTemporaryFile(mode='w') as f:
                f.write(text);f.flush()
                result=subprocess.run(['/usr/sbin/visudo','-cf',f.name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                self.assertEqual(result.returncode,0)

    def test_workflow_contract_and_inventory(self):
        # PyYAML is available on Ubuntu hosted runners and the development VPS.
        import yaml, re
        root=HERE.parent.parent
        workflow=yaml.load((root/'.github/workflows/deploy.yml').read_text(),Loader=yaml.BaseLoader)
        ci=yaml.load((root/'.github/workflows/ci.yml').read_text(),Loader=yaml.BaseLoader)
        self.assertEqual(workflow['on']['push']['branches'],['staging','production'])
        self.assertEqual(ci['on']['push']['branches'],['main']);self.assertIn('workflow_call',ci['on'])
        self.assertEqual(workflow['jobs']['verify']['uses'],'./.github/workflows/ci.yml')
        self.assertEqual(workflow['jobs']['publish']['runs-on'],'ubuntu-latest')
        self.assertEqual(workflow['jobs']['publish']['needs'],['verify','configuration'])
        configuration=workflow['jobs']['configuration']
        self.assertEqual(configuration['runs-on'],'ubuntu-latest')
        checked=configuration['steps'][1]['env']
        self.assertEqual(set(checked),set(config.SECRETS+config.VARIABLES+config.OPTIONAL+('DEPLOY_ENV',)))
        deploy=workflow['jobs']['deploy'];self.assertIn('self-hosted',deploy['runs-on'])
        self.assertEqual(deploy['needs'],['verify','publish'])
        self.assertEqual(workflow['concurrency']['cancel-in-progress'],'false')
        delivered=deploy['steps'][1]['env']
        secrets={k for k,v in delivered.items() if 'secrets.' in v}
        variables={k for k,v in delivered.items() if 'vars.' in v}
        self.assertEqual(secrets,set(config.SECRETS));self.assertEqual(variables,set(config.VARIABLES+config.OPTIONAL))
        for step in deploy['steps']:
            self.assertNotIn('checkout',step.get('uses',''));self.assertNotIn('npm ',step.get('run',''));self.assertNotIn('build ',step.get('run',''))
        for job in workflow['jobs'].values():
            for step in job.get('steps',[]):
                if 'uses' in step:self.assertRegex(step['uses'],r'@[0-9a-f]{40}$')
        self.assertEqual((root/'.github/workflows/deploy.yml').read_text(),(root/'ops/workflow-templates/deploy.yml.template').read_text())

if __name__ == "__main__":
    unittest.main(verbosity=2)
