import {createHash} from 'node:crypto';
import {z} from 'zod';
import {currentActor} from '@/lib/server/auth';
import {readPublicBlogMedia,readPrivateBlogMedia} from '../../../../../../packages/data/src/blog';
import {DomainError} from '../../../../../../packages/contracts/src/index';
import {blogFailure,blogPrivateHeaders} from '@/lib/server/blog-http';
import {blogShareCrop} from '@/lib/server/blog-media';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const id=z.string().uuid().parse((await params).id);let asset,publiclyVisible=true;
  try{asset=await readPublicBlogMedia(id);}catch(error){
    if(!(error instanceof DomainError&&error.status===404))throw error;
    publiclyVisible=false;asset=await readPrivateBlogMedia(await currentActor(request),id);
  }
  const query=new URL(request.url).searchParams;
  const focus=(key:string)=>z.coerce.number().min(0).max(1).parse(query.get(key)??'0.5');
  const share=query.get('variant')==='share',data=share?await blogShareCrop(asset.data,focus('x'),focus('y')):asset.data;
  const etag='"'+(share?createHash('sha256').update(data).digest('hex'):asset.etag)+'"';
  const host=request.headers.get('host')??new URL(request.url).host;
  const indexable=process.env.APP_ENV==='production'&&['dartspoint.nl','dartspoint.app'].includes(host);
  const headers={...blogPrivateHeaders,'Content-Type':asset.mime,'Content-Disposition':'inline','ETag':etag,...(publiclyVisible?{'Cache-Control':'public, max-age=31536000, immutable',...(indexable?{'X-Robots-Tag':'index, follow'}:{})}:{})};
  // A private image must be authorized on every request, including conditional reads.
  if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
  return new Response(new Uint8Array(data).buffer,{headers});
}catch(error){return blogFailure(error);}}
