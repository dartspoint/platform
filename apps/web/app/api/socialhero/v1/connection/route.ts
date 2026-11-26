import {revokeSocialHeroCredential} from '../../../../../../../packages/data/src/socialhero';
import {blogFailure,blogIntegration,blogPrivateHeaders} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function DELETE(request:Request){try{
  const principal=await blogIntegration(request,'drafts:read');
  await revokeSocialHeroCredential(principal);
  return new Response(null,{status:204,headers:{...blogPrivateHeaders,'X-Request-ID':crypto.randomUUID()}});
}catch(error){return blogFailure(error);}}
