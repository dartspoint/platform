import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {staff,type Actor} from './auth';
import {audit,rateLimit,transaction} from './db';
import {lobbyRoomAccess} from './lobby';
import {DomainError,requireThat,uuid} from '../../contracts/src/index';
import {heroAssetId,type MediaAsset} from '../../contracts/src/hero';
import {visibleLobbyWidgets,type LobbyLayout} from '../../contracts/src/lobby';

export const MAX_MEDIA_UPLOAD_BYTES=8*1024*1024;
const MAX_MULTIPART_BYTES=MAX_MEDIA_UPLOAD_BYTES+128*1024;
/** Bound the body before multipart decoding; content-length alone is not trusted. */
export async function boundedMediaForm(request:Request){
 const length=request.headers.get('content-length');requireThat(!length||/^\d+$/.test(length)&&Number(length)<=MAX_MULTIPART_BYTES,'upload_too_large',413,'Gebruik een afbeelding van maximaal 8 MiB.');requireThat(request.body,'empty_upload',400,'Kies een afbeelding.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>MAX_MULTIPART_BYTES){await reader.cancel();throw new DomainError('upload_too_large',413,'Gebruik een afbeelding van maximaal 8 MiB.');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 try{return await new Response(body.buffer,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();}catch{throw new DomainError('invalid_upload',400,'Het afbeeldingsbestand kon niet worden gelezen.');}
}
export async function uploadMedia(actor:Actor,form:FormData):Promise<MediaAsset>{
 staff(actor);await rateLimit('media-upload:'+actor.id,20,3600);const file=form.get('file');requireThat(file instanceof File,'image_required',400,'Kies een PNG-, JPG- of WebP-bestand.');requireThat(file.size>0&&file.size<=MAX_MEDIA_UPLOAD_BYTES,'upload_too_large',413,'Gebruik een afbeelding van maximaal 8 MiB.');requireThat(['image/png','image/jpeg','image/webp'].includes(file.type),'image_type',415,'Gebruik PNG, JPG of WebP.');
 const original=Buffer.from(await file.arrayBuffer());let image:Buffer,mobile:Buffer,width:number,height:number,mobileWidth:number,mobileHeight:number;
 try{const metadata=await sharp(original,{limitInputPixels:50_000_000,failOn:'warning',animated:false}).metadata();const formats:Record<string,string>={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'};requireThat(metadata.format&&formats[metadata.format]===file.type&&metadata.width&&metadata.height&&(metadata.pages??1)===1&&metadata.width*metadata.height<=50_000_000,'image_type',415,'Gebruik een niet-geanimeerde PNG-, JPG- of WebP-afbeelding tot 50 miljoen pixels.');
  const wide=await sharp(original,{limitInputPixels:50_000_000,failOn:'warning',animated:false}).rotate().resize({width:1600,height:900,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer({resolveWithObject:true});image=wide.data;width=wide.info.width;height=wide.info.height;
  const small=await sharp(image,{limitInputPixels:1_440_000,failOn:'warning'}).resize({width:720,height:405,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer({resolveWithObject:true});mobile=small.data;mobileWidth=small.info.width;mobileHeight=small.info.height;
 }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('invalid_image',400,'Dit bestand is geen geldige afbeelding of kan niet veilig worden verwerkt.');}
 requireThat(image!.byteLength>0&&image!.byteLength<=MAX_MEDIA_UPLOAD_BYTES&&mobile!.byteLength<=MAX_MEDIA_UPLOAD_BYTES,'upload_too_large',413,'De verwerkte afbeelding is te groot. Kies een kleiner bestand.');
 return transaction(async c=>{const id=randomUUID(),checksum=createHash('sha256').update(image!).digest('hex');const row=(await c.query('insert into private.media_assets(id,created_by,mime,bytes,width,height,checksum,image_data,mobile_data,mobile_width,mobile_height) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning created_at',[id,actor.id,'image/webp',image!.length,width!,height!,checksum,image!,mobile!,mobileWidth!,mobileHeight!])).rows[0];await audit(c,actor.id,'media.upload',id,{mime:'image/webp',bytes:image!.length,width:width!,height:height!,checksum});return {assetId:id,src:'/api/platform/media/'+id,mime:'image/webp',bytes:image!.length,width:width!,height:height!,createdAt:new Date(row.created_at).getTime()};});
}
function assetVisible(layout:LobbyLayout,id:string,roomId:string){return visibleLobbyWidgets(layout,roomId).some(w=>w.settings.tournamentImageMode==='custom'&&heroAssetId(w.settings.heroImage)===id);}
async function readableAsset(c:PoolClient,actor:Actor,id:string){
 if(['owner','admin'].includes(actor.role))return;
 const references=(await c.query("select scope,subject from private.media_references where asset_id=$1 and scope in('lobby-revision','tournament')",[id])).rows;
 const current=(await c.query('select published_revision from private.lobby_configuration where id=1')).rows[0]?.published_revision;
 for(const ref of references){
  if(ref.scope==='tournament'){const t=(await c.query("select room_id from tournaments where id::text=$1 and published and status<>'draft'",[ref.subject])).rows[0];if(!t)continue;try{await lobbyRoomAccess(c,actor,t.room_id);return;}catch(error){if(!(error instanceof DomainError&&error.status===403))throw error;}}
  else if(String(current)===ref.subject){const layout=(await c.query('select layout from private.lobby_revisions where revision=$1',[current])).rows[0]?.layout as LobbyLayout|undefined;if(!layout)continue;const rooms=(await c.query('select id from community_rooms')).rows;for(const room of rooms){if(!assetVisible(layout,id,room.id))continue;try{await lobbyRoomAccess(c,actor,room.id);return;}catch(error){if(!(error instanceof DomainError&&error.status===403))throw error;}}}
 }
 throw new DomainError('media_unavailable',404,'De afbeelding is niet beschikbaar.');
}
export async function readMedia(actor:Actor,input:unknown){const p=z.object({id:uuid,variant:z.enum(['wide','mobile']).default('wide')}).strict().parse(input);return transaction(async c=>{await readableAsset(c,actor,p.id);const column=p.variant==='mobile'?'mobile_data':'image_data';const row=(await c.query(`select ${column} image_data,checksum,mime from private.media_assets where id=$1`,[p.id])).rows[0];requireThat(row,'media_unavailable',404);return {data:row.image_data as Buffer,mime:row.mime as string,etag:createHash('sha256').update(row.image_data).digest('hex')};});}
export async function deleteMedia(actor:Actor,input:unknown){staff(actor);const {assetId}=z.object({assetId:uuid}).strict().parse(input);return transaction(async c=>{const row=(await c.query('select id from private.media_assets where id=$1 for update',[assetId])).rows[0];requireThat(row,'media_unavailable',404);requireThat(!(await c.query('select 1 from private.media_references where asset_id=$1',[assetId])).rowCount,'media_in_use',409,'Deze afbeelding wordt gebruikt door een concept, publicatie of toernooi en kan niet worden verwijderd.');await c.query('delete from private.media_assets where id=$1',[assetId]);await audit(c,actor.id,'media.delete',assetId);return {ok:true};});}
