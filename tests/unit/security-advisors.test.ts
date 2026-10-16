import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseSecurityAdvisorOutput} from '../helpers/security-advisors';

// Actual CLI 2.109.1 warning shape from a disposable PostgreSQL database.
const warning={name:'extension_in_public',title:'Extension in Public',level:'WARN',facing:'EXTERNAL',categories:['SECURITY'],description:'Detects extensions installed in the `public` schema.',detail:'Extension `pgcrypto` is installed in the public schema. Move it to another schema.',remediation:'https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public',metadata:{name:'pgcrypto',type:'extension',schema:'public'}};
test('Security advisors normalize actual JSON-envelope and non-agent list keys',()=>{
 const expected={...warning,cacheKey:'extension_in_public_pgcrypto'};
 assert.deepEqual(parseSecurityAdvisorOutput(JSON.stringify({results:[expected],message:'db advisors'})),[expected]);
 assert.deepEqual(parseSecurityAdvisorOutput(JSON.stringify([{...warning,cache_key:expected.cacheKey}])),[expected]);
});
test('Security advisors accept explicit successful empty results',()=>{
 assert.deepEqual(parseSecurityAdvisorOutput('{"results":[],"message":"db advisors"}'),[]);
 assert.deepEqual(parseSecurityAdvisorOutput('[]'),[]);
});
test('Missing, malformed or failed advisor output cannot report a clean schema',()=>{
 for(const value of ['', '{}', '{"message":"db advisors"}', '{"results":null,"message":"db advisors"}', '{"results":[],"message":"unknown command"}', '{"results":[],"message":"db advisors","error":"failed"}', JSON.stringify({results:[warning],message:'db advisors'}),JSON.stringify({results:[{...warning,cacheKey:'issue',level:'UNKNOWN'}],message:'db advisors'}),JSON.stringify([{...warning,cache_key:''}])])assert.throws(()=>parseSecurityAdvisorOutput(value));
});
