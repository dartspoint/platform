import {currentActor} from '@/lib/server/auth';
import {authorizeBlog,storeBlogMedia} from '../../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,requireBlogOrigin} from '@/lib/server/blog-http';
import {decodeBlogUpload} from '@/lib/server/blog-media';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){try{
  requireBlogOrigin(request);const actor=await currentActor(request);await authorizeBlog(actor);
  return blogResponse(await storeBlogMedia(actor,await decodeBlogUpload(request)),201);
}catch(error){return blogFailure(error);}}
