"""Bind only this project's Supabase published ports to loopback, retaining data."""
import http.client,json,socket,subprocess,urllib.parse,os
class Docker(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect(os.environ.get('DOCKER_HOST','unix:///var/run/docker.sock').removeprefix('unix://'))
def request(method,path,body=None):
 connection=Docker('localhost');connection.request(method,path,json.dumps(body) if body is not None else None,{'Content-Type':'application/json'});response=connection.getresponse();raw=response.read();connection.close()
 if response.status>=300:raise RuntimeError('Docker local configuration failed: '+str(response.status))
 return json.loads(raw) if raw else {}
for name in ['supabase_kong_dartspoint-development','supabase_inbucket_dartspoint-development','supabase_db_dartspoint-development']:
 item=request('GET','/containers/'+name+'/json');bindings=item['HostConfig'].get('PortBindings') or {}
 if not any(p.get('HostIp') not in ('127.0.0.1','::1') for ports in bindings.values() for p in ports):continue
 config=item['Config'];host=item['HostConfig'];host['PortBindings']={port:[{'HostIp':'127.0.0.1','HostPort':ports[0]['HostPort']}] for port,ports in bindings.items()}
 config['HostConfig']=host;config['NetworkingConfig']={'EndpointsConfig':{network:{'Aliases':[name]} for network in item['NetworkSettings']['Networks']}}
 request('POST','/containers/'+name+'/stop?t=30');request('POST','/containers/'+name+'/rename?name='+name+'-loopback-old')
 try:
  created=request('POST','/containers/create?name='+name,config);request('POST','/containers/'+created['Id']+'/start')
 except Exception:
  try:request('DELETE','/containers/'+name+'?force=true')
  except Exception:pass
  request('POST','/containers/'+name+'-loopback-old/rename?name='+name);request('POST','/containers/'+name+'/start');raise
 request('DELETE','/containers/'+name+'-loopback-old')
 print(json.dumps({'event':'local_service_bound_to_loopback','service':name}))
