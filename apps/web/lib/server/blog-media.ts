import 'server-only';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {DomainError,requireThat} from '../../../../packages/contracts/src/index';
import {boundedMediaForm,MAX_MEDIA_UPLOAD_BYTES} from '../../../../packages/data/src/media';

/** Decode and re-encode every upload; no caller-supplied dimensions or MIME survive. */
export async function decodeBlogUpload(request:Request){
  requireThat(request.headers.get('content-type')?.startsWith('multipart/form-data'),'INVALID_REQUEST',415,'Gebruik multipart/form-data.');
  const form=await boundedMediaForm(request),file=form.get('file');
  requireThat(file instanceof File,'INVALID_MEDIA',415,'Kies een JPG-, PNG- of WebP-bestand.');
  requireThat(file.size>0&&file.size<=MAX_MEDIA_UPLOAD_BYTES,'PAYLOAD_TOO_LARGE',413,'Gebruik een afbeelding van maximaal 8 MiB.');
  requireThat(['image/jpeg','image/png','image/webp'].includes(file.type),'INVALID_MEDIA',415,'Gebruik JPG, PNG of WebP.');
  const original=Buffer.from(await file.arrayBuffer());
  const sourceFingerprint=createHash('sha256').update(original).update('\0'+file.name+'\0'+file.type).digest('hex');
  try{
    const options={limitInputPixels:50_000_000,failOn:'warning' as const,animated:false};
    const metadata=await sharp(original,options).metadata();
    const formats:Record<string,string>={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
    requireThat(metadata.format&&formats[metadata.format]===file.type&&metadata.width&&metadata.height&&(metadata.pages??1)===1&&metadata.width>=64&&metadata.height>=64&&metadata.width<=12000&&metadata.height<=12000,'INVALID_MEDIA',415,'Gebruik een geldige, niet-geanimeerde afbeelding van 64 tot 12000 pixels.');
    const result=await sharp(original,options).rotate().resize({width:2400,height:3000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    requireThat(result.data.length<=MAX_MEDIA_UPLOAD_BYTES,'PAYLOAD_TOO_LARGE',413,'De verwerkte afbeelding is te groot.');
    const {dominant}=await sharp(result.data).stats();
    const color='#'+[dominant.r,dominant.g,dominant.b].map(n=>n.toString(16).padStart(2,'0')).join('');
    return {bytes:result.data,width:result.info.width,height:result.info.height,mime:'image/webp' as const,sourceFingerprint,color};
  }catch(error){if(error instanceof DomainError)throw error;throw new DomainError('INVALID_MEDIA',415,'De afbeelding kan niet worden gedecodeerd.');}
}

/** Stable 1200 × 630 derivative, with the editor's normalized focus point. */
export async function blogShareCrop(data:Buffer,x:number,y:number){
  const metadata=await sharp(data).metadata();const width=metadata.width!,height=metadata.height!;
  const ratio=1200/630,cropWidth=Math.min(width,Math.round(height*ratio)),cropHeight=Math.min(height,Math.round(width/ratio));
  const left=Math.max(0,Math.min(width-cropWidth,Math.round(x*width-cropWidth/2)));
  const top=Math.max(0,Math.min(height-cropHeight,Math.round(y*height-cropHeight/2)));
  return sharp(data).extract({left,top,width:cropWidth,height:cropHeight}).resize(1200,630).webp({quality:85}).toBuffer();
}
