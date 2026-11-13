import {storeBlogMedia} from '../../../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,blogIntegration,blogOperationKey} from '@/lib/server/blog-http';
import {decodeBlogUpload} from '@/lib/server/blog-media';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){try{
  const principal=await blogIntegration(request,'media:write'),key=blogOperationKey(request);
  return blogResponse(await storeBlogMedia(principal,await decodeBlogUpload(request),key),201);
}catch(error){return blogFailure(error);}}
