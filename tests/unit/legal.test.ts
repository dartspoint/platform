import test from 'node:test';
import assert from 'node:assert/strict';
import {legalAcceptanceSchema,safeAuthDestination,safeDocumentLink,validatePublicationTiming} from '../../packages/contracts/src/legal';
test('OAuth return paths use a strict local product allowlist',()=>{
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/lobby?next=https://evil.example','/lobby#x','javascript:alert(1)','/%2f%2fevil.example','/toernooi/../admin','/mijn-tickets/other'])assert.equal(safeAuthDestination(value),'/lobby');
 for(const value of ['/spelen','/clubhuis','/mijn-tickets','/support','/account/privacy','/toernooi/open-2026','/team/support?ticket=3f1198de-e71b-46a4-91ed-60ef22664de6'])assert.equal(safeAuthDestination(value),value);
 assert.equal(safeAuthDestination('/team/support?ticket=3f1198de-e71b-46a4-91ed-60ef22664de6&next=https://evil.example'),'/lobby');
});
test('Markdown links reject executable protocols and protocol-relative URLs',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,test','//evil.example','/\\evil.example','vbscript:test','http://insecure.example'])assert.equal(safeDocumentLink(value),null);
 for(const value of ['/privacy','https://www.cloudflare.com/en-gb/turnstile-privacy-policy/','mailto:support@dartspoint.nl'])assert.equal(safeDocumentLink(value),value);
});
test('Material changes require thirty days or an explicit necessary exception',()=>{
 const publishedAt=new Date('2026-10-15T10:00:00Z');
 assert.throws(()=>validatePublicationTiming({material:true,publishedAt,effectiveAt:new Date('2026-11-14T09:59:59Z')}));
 assert.doesNotThrow(()=>validatePublicationTiming({material:true,publishedAt,effectiveAt:new Date('2026-11-14T10:00:00Z')}));
 assert.doesNotThrow(()=>validatePublicationTiming({material:true,publishedAt,effectiveAt:publishedAt,exceptionReason:'Noodzakelijke beveiligingswijziging'}));
 assert.doesNotThrow(()=>validatePublicationTiming({material:false,publishedAt,effectiveAt:publishedAt}));
 assert.throws(()=>validatePublicationTiming({material:false,publishedAt,effectiveAt:new Date('2026-10-14T10:00:00Z')}));
});
test('Acceptance requires age and terms, and cannot smuggle blanket privacy consent or IP',()=>{
 const input={termsVersionId:'3f1198de-e71b-46a4-91ed-60ef22664de6',privacyVersionId:'ba6f73c0-5e5c-482a-9127-d3ed27f4930d',age16Confirmed:true,termsAccepted:true};
 assert.equal(legalAcceptanceSchema.safeParse(input).success,true);
 assert.equal(legalAcceptanceSchema.safeParse({...input,age16Confirmed:false}).success,false);
 assert.equal(legalAcceptanceSchema.safeParse({...input,privacyConsent:true}).success,false);
 assert.equal(legalAcceptanceSchema.safeParse({...input,ipAddress:'192.0.2.1'}).success,false);
});
