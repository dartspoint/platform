import {currentActor} from '@/lib/server/auth';
import {blogAdmin,saveBlogDraft} from '../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return blogResponse({entries:await blogAdmin(await currentActor(request))});}catch(error){return blogFailure(error);}}
export async function POST(request:Request){try{requireBlogOrigin(request);const actor=await currentActor(request),input=await readBlogJson(request);return blogResponse({entry:await saveBlogDraft(actor,input)},input.id?200:201);}catch(error){return blogFailure(error);}}
