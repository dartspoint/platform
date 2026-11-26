import {currentActor} from '@/lib/server/auth';
import {saveBlogDraft,processBlogPublication} from '../../../../../packages/data/src/blog';
import {adminBlogEntry,adminBlogPage} from '../../../../../packages/data/src/blog-query';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
import {revalidateBlogPaths} from '@/lib/server/blog-publication';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{
 const actor=await currentActor(request),query=Object.fromEntries(new URL(request.url).searchParams);
 if(query.id){let entry=await adminBlogEntry(actor,query.id);if(entry.publicationState==='publishing'&&entry.publicationId){revalidateBlogPaths();await processBlogPublication(entry.publicationId);entry=await adminBlogEntry(actor,query.id);}return blogResponse({entry});}
 return blogResponse(await adminBlogPage(actor,query));
}catch(error){return blogFailure(error);}}
export async function POST(request:Request){try{requireBlogOrigin(request);const actor=await currentActor(request),input=await readBlogJson(request);return blogResponse({entry:await saveBlogDraft(actor,input)},input.id?200:201);}catch(error){return blogFailure(error);}}
