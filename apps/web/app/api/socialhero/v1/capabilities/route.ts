import {blogCapabilities} from '../../../../../../../packages/data/src/blog';
import {blogFailure,blogResponse,blogIntegration} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){try{return blogResponse(await blogCapabilities(await blogIntegration(request,'capabilities:read')));}catch(error){return blogFailure(error);}}
