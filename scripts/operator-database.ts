import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

/** Use the same session-port and verified-TLS normalization as delivery. The
 * credential stays in a private child environment, never in argv or logs. */
export function normalizeOperatorDatabaseUrl(value:string):string{
 return execFileSync('python3',['-c',"import os,sys;sys.path.insert(0,'ops/scripts');from deployment_config import normalize_database_url;print(normalize_database_url(os.environ['DARTSPOINT_OPERATOR_DATABASE_URL']))"],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  env:{...process.env,DARTSPOINT_OPERATOR_DATABASE_URL:value},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000,
 }).trim();
}
