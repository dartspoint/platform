import {getSocialHeroPost,saveSocialHeroDraft} from '../../../../../../../../packages/data/src/blog';
import {blogETag,blogFailure,blogResponse,blogIntegration,blogOperationKey,readBlogJson} from '@/lib/server/blog-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{externalId:string}>};
export async function GET(request:Request,{params}:Context){try{
  const principal=await blogIntegration(request,'drafts:read'),result=await getSocialHeroPost(principal,(await params).externalId);
  return blogResponse(result,200,{'ETag':blogETag(result.draftRevision)});
}catch(error){return blogFailure(error);}}
export async function PUT(request:Request,{params}:Context){try{
  const principal=await blogIntegration(request,'drafts:write'),key=blogOperationKey(request),{externalId}=await params;
  const result=await saveSocialHeroDraft(principal,externalId,await readBlogJson(request),{key,ifMatch:request.headers.get('if-match')??undefined,createOnly:request.headers.get('if-none-match')==='*'});
  return blogResponse(result,result.created?201:200,{'ETag':blogETag(result.revision)});
}catch(error){return blogFailure(error);}}
