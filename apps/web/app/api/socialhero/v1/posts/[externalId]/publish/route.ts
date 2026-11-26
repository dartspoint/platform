import {z} from 'zod';
import {publishSocialHeroPost,refreshBlogPublicationResult,processBlogPublication} from '../../../../../../../../../packages/data/src/blog';
import {blogETag,blogFailure,blogResponse,blogIntegration,blogOperationKey,readBlogJson} from '@/lib/server/blog-http';
import {revalidateBlogPaths,supersededPublicationResponse} from '@/lib/server/blog-publication';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{externalId:string}>}){try{
  const principal=await blogIntegration(request,'posts:publish'),key=blogOperationKey(request);
  const {revision}=z.object({revision:z.coerce.number().int().positive()}).strict().parse(await readBlogJson(request,10_000));
  const externalId=(await params).externalId;let result=await publishSocialHeroPost(principal,externalId,revision,key);
  revalidateBlogPaths();
  if(result.publicationId&&result.state==='publishing'){await processBlogPublication(result.publicationId);result=await refreshBlogPublicationResult(principal,result);}
  if('retryable' in result&&result.retryable===false)return supersededPublicationResponse(result);
  return blogResponse(result,result.state==='publishing'?202:200,{'ETag':blogETag(result.publishedRevision!),...(result.state==='publishing'?{'Retry-After':'3'}:{})});
}catch(error){return blogFailure(error);}}
