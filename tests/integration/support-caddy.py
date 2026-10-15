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
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
source=(root/'ops/Caddyfile.staging').read_text();start,end=host.staging_span(source);site=source[start:end].replace('staging.dartspoint.nl {','http://127.0.0.1:'+str(port)+' {',1).replace('100.64.0.0/10 fd7a:115c:a1e0::/48 127.0.0.1 ::1','192.0.2.123').replace('127.0.0.1:3001','127.0.0.1:'+str(backend.server_port))
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
                if status('/privacy','GET')==403:break
            except (OSError,urllib.error.URLError):pass
            time.sleep(.05)
        checks={('POST','/api/support/inbound'):201,('GET','/api/support/inbound'):405,('POST','/api/support/inbound/'):403,('POST','/api/platform/auth/request'):403,('GET','/privacy'):403,('GET','/support'):403}
        for (method,path),expected in checks.items():assert status(path,method)==expected,(method,path,expected)
        print(json.dumps({'event':'support_caddy_boundary_passed','checks':len(checks),'publicPostOnly':True,'otherStagingPathsRestricted':True,'loopbackOnlyTest':True}))
    finally:process.terminate();process.wait(timeout=5);backend.shutdown();backend.server_close()
