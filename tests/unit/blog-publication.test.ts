import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBlogPublication} from '../../packages/data/src/blog-publication';

const expected={url:'https://dartspoint.nl/blog/voorbeeld',origin:'https://dartspoint.nl',proof:'opaque-public-revision-proof',revision:7,externalId:'external-7'};
const html='<meta content="opaque-public-revision-proof" name="socialhero:publication"><meta name="socialhero:revision" content="7"><meta name="socialhero:external-id" content="external-7">';
test('public proof requires the expected opaque marker and revision; HTTP 200 alone is insufficient',async()=>{
 const result=await verifyBlogPublication(expected,async()=>new Response('<h1>Old article</h1>',{headers:{'content-type':'text/html'}}));assert.deepEqual(result,{verified:false,code:'PUBLICATION_NOT_VISIBLE'});
 assert.deepEqual(await verifyBlogPublication(expected,async()=>new Response(html,{headers:{'content-type':'text/html'}})),{verified:true});
 assert.deepEqual(await verifyBlogPublication({...expected,revision:8},async()=>new Response(html,{headers:{'content-type':'text/html'}})),{verified:false,code:'PUBLICATION_NOT_VISIBLE'});
});
test('publication verification only requests a fixed canonical article URL, without redirects or credentials',async()=>{
 let calls=0;
 const transport:typeof fetch=async(input,init)=>{calls++;assert.equal(input,expected.url);assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(new Headers(init?.headers).has('authorization'),false);return new Response(html,{headers:{'content-type':'text/html'}});};
 assert.equal((await verifyBlogPublication(expected,transport)).verified,true);assert.equal(calls,1);
 for(const url of ['https://other.example/blog/voorbeeld','https://dartspoint.nl/api/private','https://dartspoint.nl/blog/voorbeeld?redirect=https://other.example','https://user@dartspoint.nl/blog/voorbeeld'])assert.deepEqual(await verifyBlogPublication({...expected,url},transport),{verified:false,code:'PUBLICATION_DESTINATION_INVALID'});
 assert.equal(calls,1);
});
test('temporary errors and oversized public responses remain retryable safe failures',async()=>{
 assert.deepEqual(await verifyBlogPublication(expected,async()=>{throw new Error('private network details');}),{verified:false,code:'PUBLICATION_UNREACHABLE'});
 assert.deepEqual(await verifyBlogPublication(expected,async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'text/html'}})),{verified:false,code:'PUBLICATION_RESPONSE_TOO_LARGE'});
 assert.deepEqual(await verifyBlogPublication(expected,async()=>new Response(null,{status:302,headers:{location:'https://other.example'}})),{verified:false,code:'PUBLICATION_NOT_VISIBLE'});
});
