#!/usr/bin/env python3
"""Exercise only a disposable loopback Caddy instance; never reload the installed service."""
import http.server, importlib.util, json, socket, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[2]
binary=Path(sys.argv[1] if len(sys.argv)>1 else '/home/codex/.cache/dartspoint-qa-followup-tools-20261014/caddy')
spec=importlib.util.spec_from_file_location('support_update',root/'ops/update-support-host.template.py');host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
class Backend(http.server.BaseHTTPRequestHandler):
    def do_POST(self):self.send_response(201);self.end_headers();self.wfile.write(b'signed webhook endpoint')
    def do_GET(self):self.send_response(200);self.end_headers()
    def log_message(self,*args):pass
backend=http.server.ThreadingHTTPServer(('127.0.0.1',0),Backend);thread=threading.Thread(target=backend.serve_forever,daemon=True);thread.start()
source=(root/'ops/Caddyfile.staging').read_text().replace(host.WEBHOOK_RULE,host.OUTSIDE)
# Exercise the exact transformation that previously failed on a caddy-fmt host.
formatted=subprocess.run([str(binary),'fmt','-'],input=source,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
assert '\t@outside not remote_ip' in formatted
updated=host.staging_webhook(formatted);before_start,before_end=host.staging_span(formatted);after_start,after_end=host.staging_span(updated)
assert formatted[:before_start]==updated[:after_start] and formatted[before_end:]==updated[after_end:]
formatted_updated=subprocess.run([str(binary),'fmt','-'],input=updated,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
assert host.staging_configuration(formatted_updated)==(formatted_updated,'tailscale-with-signed-webhook')
public=source[:before_start]+source[before_start:before_end].replace(host.OUTSIDE+'\n','').replace('    respond @outside 403\n','')+source[before_end:]
public_formatted=subprocess.run([str(binary),'fmt','-'],input=public,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
assert host.staging_configuration(public_formatted)==(public_formatted,'public-preserved')

def exercise(configuration,checks,probe_status):
    with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
    start,end=host.staging_span(configuration);site=configuration[start:end].replace('staging.dartspoint.nl {','http://127.0.0.1:'+str(port)+' {',1).replace('100.64.0.0/10 fd7a:115c:a1e0::/48 127.0.0.1 ::1','192.0.2.123').replace('127.0.0.1:3001','127.0.0.1:'+str(backend.server_port))
    with tempfile.TemporaryDirectory(prefix='dartspoint-caddy-support-') as folder:
        config=Path(folder)/'Caddyfile';config.write_text('{\n admin off\n auto_https off\n}\n'+site+'\n')
        process=subprocess.Popen([str(binary),'run','--config',str(config),'--adapter','caddyfile'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        def status(path,method):
            try:
                with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=b'{}' if method=='POST' else None,method=method),timeout=2) as response:return response.status
            except urllib.error.HTTPError as error:return error.code
        try:
            for _ in range(100):
                try:
                    if status('/privacy','GET')==probe_status:break
                except (OSError,urllib.error.URLError):pass
                time.sleep(.05)
            for (method,path),expected in checks.items():assert status(path,method)==expected,(method,path,expected)
        finally:process.terminate();process.wait(timeout=5)
try:
    private_checks={('POST','/api/support/inbound'):201,('GET','/api/support/inbound'):405,('POST','/api/support/inbound/'):403,('POST','/api/platform/auth/request'):403,('GET','/privacy'):403,('GET','/support'):403}
    exercise(formatted_updated,private_checks,403)
    public_checks={('POST','/api/support/inbound'):201,('GET','/api/support/inbound'):200,('POST','/api/platform/auth/request'):201,('GET','/privacy'):200,('GET','/support'):200,('GET','/internal'):404,('GET','/internal/private'):404}
    exercise(public_formatted,public_checks,200)
    print(json.dumps({'event':'support_caddy_boundary_passed','privateChecks':len(private_checks),'publicChecks':len(public_checks),'privatePublicPostOnly':True,'privateOtherPathsRestricted':True,'publicReachabilityPreserved':True,'publicConfigurationByteIdentical':True,'loopbackOnlyTest':True,'realCaddyFormattedFixtures':True,'formattedIdempotence':True,'otherBlocksByteIdentical':True}))
finally:backend.shutdown();backend.server_close()
