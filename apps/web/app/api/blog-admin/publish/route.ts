import {currentActor} from '@/lib/server/auth';
import {publishBlog,refreshBlogPublicationResult,processBlogPublication} from '../../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
import {revalidateBlogPaths,supersededPublicationResponse} from '@/lib/server/blog-publication';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){try{
  requireBlogOrigin(request);const actor=await currentActor(request),input=await readBlogJson(request);
  let entry=await publishBlog(actor,input);revalidateBlogPaths();
  if(entry.publicationId&&entry.publicationState==='publishing'){await processBlogPublication(entry.publicationId);entry=await refreshBlogPublicationResult(actor,entry);}
  if('retryable' in entry&&entry.retryable===false)return supersededPublicationResponse({entry});
  return blogResponse({entry},entry.publicationState==='publishing'?202:200,entry.publicationState==='publishing'?{'Retry-After':'3'}:{});
}catch(error){return blogFailure(error);}}
