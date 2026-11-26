import {decodeHTML} from 'entities';

export type PublicationProof={url:string;origin:string;proof:string;revision:number;externalId?:string};
export type PublicationCheck={verified:true}|{verified:false;code:string};

function meta(html:string,name:string){
 for(const tag of html.match(/<meta\b[^>]*>/gi)??[]){
  const attrs:Record<string,string>={};
  for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[match[1].toLowerCase()]=decodeHTML(match[2]??match[3]??match[4]);
  if(attrs.name===name)return attrs.content;
 }
 return undefined;
}

/** Only a configured canonical URL is requested. Redirects, response bodies and errors never escape. */
export async function verifyBlogPublication(expected:PublicationProof,transport:typeof fetch=fetch):Promise<PublicationCheck>{
 let url:URL;try{url=new URL(expected.url);}catch{return {verified:false,code:'PUBLICATION_DESTINATION_INVALID'};}
 if(url.origin!==expected.origin||url.username||url.password||url.search||url.hash||!url.pathname.match(/^(?:\/en)?\/blog\/[a-z0-9-]+$/))return {verified:false,code:'PUBLICATION_DESTINATION_INVALID'};
 try{
  const response=await transport(url.href,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{Accept:'text/html','Cache-Control':'no-cache','User-Agent':'DartsPoint-Publication-Verification/1'}});
  if(response.status!==200||response.url&&response.url!==url.href||!response.headers.get('content-type')?.includes('text/html'))return {verified:false,code:'PUBLICATION_NOT_VISIBLE'};
  const reader=response.body?.getReader();if(!reader)return {verified:false,code:'PUBLICATION_RESPONSE_INVALID'};
  const decoder=new TextDecoder();let html='',size=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2_000_000){await reader.cancel();return {verified:false,code:'PUBLICATION_RESPONSE_TOO_LARGE'};}html+=decoder.decode(chunk.value,{stream:true});}html+=decoder.decode();}finally{reader.releaseLock();}
  if(meta(html,'socialhero:publication')!==expected.proof||meta(html,'socialhero:revision')!==String(expected.revision)||expected.externalId&&meta(html,'socialhero:external-id')!==expected.externalId)return {verified:false,code:'PUBLICATION_NOT_VISIBLE'};
  return {verified:true};
 }catch{return {verified:false,code:'PUBLICATION_UNREACHABLE'};}
}
