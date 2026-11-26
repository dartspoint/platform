import {currentActor} from '@/lib/server/auth';
import {blogFailure,blogResponse,readBlogJson,requireBlogOrigin} from '@/lib/server/blog-http';
import {blogTaxonomy,mutateBlogTaxonomy} from '../../../../../../packages/data/src/blog-taxonomy';
import {rateLimit} from '../../../../../../packages/data/src/db';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return blogResponse(await blogTaxonomy(await currentActor(request)));}catch(error){return blogFailure(error);}}
export async function POST(request:Request){try{requireBlogOrigin(request);const actor=await currentActor(request);await rateLimit('blog-taxonomy:'+actor.id,60,60);return blogResponse(await mutateBlogTaxonomy(actor,await readBlogJson(request,4000)));}catch(error){return blogFailure(error);}}
