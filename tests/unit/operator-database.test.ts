import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOperatorDatabaseUrl} from '../../scripts/operator-database';
test('operator connections reuse delivery session pooling and verified TLS for raw provider URLs',()=>{
 const url=new URL(normalizeOperatorDatabaseUrl('postgresql://postgres.example:fixture-password@aws-0-example.pooler.supabase.com:6543/postgres'));
 assert.equal(url.port,'5432');assert.equal(url.searchParams.get('sslmode'),'verify-full');assert.equal(url.username,'postgres.example');
 assert.equal(normalizeOperatorDatabaseUrl(url.href),url.href);
});
test('operator normalization rejects TLS downgrades and unreviewed certificate parameters',()=>{
 for(const query of ['sslmode=disable','sslmode=require&sslmode=disable','sslmode=require&sslcert=unreviewed','sslmode'])assert.throws(()=>normalizeOperatorDatabaseUrl('postgresql://postgres:fixture-password@db.example.supabase.co:5432/postgres?'+query));
});
test('operator normalization validates the connection without exposing the credential',()=>{
 for(const value of ['postgresql://postgres:fixture-password@unreviewed.example:6543/postgres','https://postgres:fixture-password@db.example.supabase.co/postgres','postgresql://postgres:fixture-password@db.example.supabase.co/other','postgresql://postgres:fixture-password@db.example.supabase.co/postgres#fragment','postgresql://postgres@db.example.supabase.co/postgres']){
  assert.throws(()=>normalizeOperatorDatabaseUrl(value),error=>error instanceof Error&&error.message==='DATABASE_URL must be a valid Supabase connection with verified TLS');
 }
 const direct=new URL(normalizeOperatorDatabaseUrl('postgres://postgres:fixture-password@db.abcdefghijklmnopqrst.supabase.co:6543/postgres?application_name=operator&sslmode=require'));
 assert.equal(direct.port,'5432');assert.equal(direct.searchParams.get('application_name'),'operator');assert.equal(direct.searchParams.get('sslmode'),'verify-full');
});
