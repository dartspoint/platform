import {revalidatePath} from 'next/cache';
import {currentActor} from '@/lib/server/auth';
import {publishBlog} from '../../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){try{
  requireBlogOrigin(request);const actor=await currentActor(request),input=await readBlogJson(request);
  const entry=await publishBlog(actor,input);
  revalidatePath('/blog','layout');revalidatePath('/');revalidatePath('/sitemap.xml');
  return blogResponse({entry});
}catch(error){return blogFailure(error);}}
