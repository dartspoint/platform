import {writeFile} from 'node:fs/promises';
import {renderSupabaseOtpTemplate} from '../packages/emails/src/templates';
/** One branch per provider send; no additional token or email is requested. */
const englishFlows=['https://dartspoint.nl','https://www.dartspoint.nl','https://dartspoint.app','https://www.dartspoint.app','https://staging.dartspoint.nl','https://staging.dartspoint.app','http://127.0.0.1:4300','http://127.0.0.1:4302','http://localhost:4300','http://localhost:4302'].map(origin=>origin+'/en/inloggen');
export const englishOtpCondition='or '+englishFlows.map(url=>`(eq .RedirectTo "${url}")`).join(' ');
export const otpSubject=`{{ if ${englishOtpCondition} }}Your DartsPoint sign-in code{{ else }}Je DartsPoint-inlogcode{{ end }}`;
for(const [environment,origin]of [['local','http://127.0.0.1:4300'],['staging','https://staging.dartspoint.nl'],['production','https://dartspoint.nl']] as const){
 const nl=renderSupabaseOtpTemplate({origin,localDevelopment:environment==='local',locale:'nl'}),en=renderSupabaseOtpTemplate({origin,localDevelopment:environment==='local',locale:'en'});
 for(const kind of ['html','text']as const){const value=`{{ if ${englishOtpCondition} }}\n${en[kind]}\n{{ else }}\n${nl[kind]}\n{{ end }}\n`;
  await writeFile(environment==='local'?`supabase/templates/otp.${kind==='text'?'txt':'html'}`:`packages/emails/templates/supabase-otp-${environment}.${kind==='text'?'txt':'html'}`,value);
 }
}
await writeFile('packages/emails/templates/supabase-otp-subject.txt',otpSubject+'\n');
