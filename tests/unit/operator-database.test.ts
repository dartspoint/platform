import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOperatorDatabaseUrl} from '../../scripts/operator-database';
test('operator connections reuse delivery session pooling and verified TLS for raw provider URLs',()=>{
 const url=new URL(normalizeOperatorDatabaseUrl('postgresql://postgres.example:fixture-password@aws-0-example.pooler.supabase.com:6543/postgres'));
 assert.equal(url.port,'5432');assert.equal(url.searchParams.get('sslmode'),'verify-full');assert.equal(url.username,'postgres.example');
 assert.equal(normalizeOperatorDatabaseUrl(url.href),url.href);
});
test('operator normalization rejects TLS downgrades and unreviewed certificate parameters',()=>{
 for(const query of ['sslmode=disable','sslmode=require&sslmode=disable','sslmode=require&sslcert=unreviewed'])assert.throws(()=>normalizeOperatorDatabaseUrl('postgresql://postgres:fixture-password@db.example.supabase.co:5432/postgres?'+query));
});
