import {z} from 'zod';
import {currentActor} from '@/lib/server/auth';
import {createBlogToken,revokeBlogToken,listBlogTokens} from '../../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return blogResponse({credentials:await listBlogTokens(await currentActor(request))});}catch(error){return blogFailure(error);}}
export async function POST(request:Request){try{
  requireBlogOrigin(request);const actor=await currentActor(request),input=await readBlogJson(request,10_000);
  if(input.action==='revoke')return blogResponse(await revokeBlogToken(actor,z.string().uuid().parse(input.id)));
  const {action,...settings}=input;z.literal('create').parse(action);
  return blogResponse(await createBlogToken(actor,settings),201);
}catch(error){return blogFailure(error);}}
