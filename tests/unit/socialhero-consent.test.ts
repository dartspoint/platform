import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalyticsConsent,parseAnalyticsConsent,SOCIALHERO_CONSENT_MAX_AGE} from '../../apps/web/lib/socialhero-consent';
test('analytics permission requires an explicit current, bounded consent record',()=>{
 const now=Date.now(),grant=createAnalyticsConsent('granted',now),denial=createAnalyticsConsent('denied',now);
 assert.equal(parseAnalyticsConsent(JSON.stringify(grant),now)?.choice,'granted');assert.equal(parseAnalyticsConsent(JSON.stringify(denial),now)?.choice,'denied');
 for(const raw of [null,'broken','true',JSON.stringify({...grant,version:2}),JSON.stringify({...grant,choice:'accepted'}),JSON.stringify({...grant,decidedAt:now+1}),JSON.stringify({...grant,expiresAt:now}),JSON.stringify({...grant,expiresAt:now+SOCIALHERO_CONSENT_MAX_AGE+1})])assert.equal(parseAnalyticsConsent(raw,now),null);
 assert.equal(parseAnalyticsConsent(JSON.stringify(grant),grant.expiresAt),null);
});
