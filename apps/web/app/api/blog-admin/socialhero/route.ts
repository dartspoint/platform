import {z} from 'zod';
import {currentActor} from '@/lib/server/auth';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
import {rateLimit} from '../../../../../../packages/data/src/db';
import {checkSocialHeroConnection,disconnectSocialHero,pairSocialHero,setSocialHeroPolicy,socialHeroAdminStatus} from '../../../../../../packages/data/src/socialhero';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const action=z.discriminatedUnion('action',[
  z.object({action:z.literal('pair'),code:z.string().max(512),draftEnabled:z.boolean(),publishEnabled:z.boolean()}).strict(),
  z.object({action:z.literal('check')}).strict(),
  z.object({action:z.literal('disconnect')}).strict(),
  z.object({action:z.literal('policy'),destinationId:z.string().max(200),draftEnabled:z.boolean(),publishEnabled:z.boolean()}).strict(),
]);
export async function GET(request:Request){try{return blogResponse(await socialHeroAdminStatus(await currentActor(request)));}catch(error){return blogFailure(error);}}
export async function POST(request:Request){try{
  requireBlogOrigin(request);const actor=await currentActor(request);
  const input=action.parse(await readBlogJson(request,4000));
  await rateLimit('socialhero-admin:'+actor.id,input.action==='pair'?8:60,60);
  switch(input.action){
    case 'pair':return blogResponse(await pairSocialHero(actor,{code:input.code,draftEnabled:input.draftEnabled,publishEnabled:input.publishEnabled}));
    case 'check':return blogResponse(await checkSocialHeroConnection(actor));
    case 'disconnect':return blogResponse(await disconnectSocialHero(actor));
    case 'policy':return blogResponse(await setSocialHeroPolicy(actor,{destinationId:input.destinationId,draftEnabled:input.draftEnabled,publishEnabled:input.publishEnabled}));
  }
}catch(error){return blogFailure(error);}}
