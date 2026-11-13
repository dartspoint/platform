import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {publishSocialHeroPost} from '../../../../../../../../../packages/data/src/blog';
import {blogETag,blogFailure,blogResponse,blogIntegration,blogOperationKey,readBlogJson} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{externalId:string}>}){try{
  const principal=await blogIntegration(request,'posts:publish'),key=blogOperationKey(request);
  const {revision}=z.object({revision:z.coerce.number().int().positive()}).strict().parse(await readBlogJson(request,10_000));
  const result=await publishSocialHeroPost(principal,(await params).externalId,revision,key);
  revalidatePath('/blog','layout');revalidatePath('/');revalidatePath('/sitemap.xml');
  return blogResponse(result,200,{'ETag':blogETag(result.publishedRevision!)});
}catch(error){return blogFailure(error);}}
