/** Durable image references shared by tournament pages, widgets and their editor. */
export type HeroImage = {src:string;positionX:number;positionY:number;overlay:number};
export type MediaAsset = {assetId:string;src:string;mime:'image/webp';bytes:number;width:number;height:number;createdAt:number};
export const DEFAULT_HERO_IMAGE:HeroImage=Object.freeze({src:'/marketing/afterhours-hero.webp',positionX:70,positionY:50,overlay:45});
export const NO_HERO_IMAGE:HeroImage=Object.freeze({src:'',positionX:50,positionY:50,overlay:45});
export const HERO_EXTERNAL_HOSTS=Object.freeze(['images.unsplash.com','images.pexels.com']);
export const MAX_HERO_IMAGE_SOURCE_LENGTH=2048;
/** External images are browser-loaded only from these exact hosts. Never server-fetched. */
export function safeHeroImageSrc(value?:string):string{
 if(typeof value!=='string'||!value||value.length>MAX_HERO_IMAGE_SOURCE_LENGTH||/[\\\s\u0000-\u001f\u007f]/.test(value))return '';
 if(value===DEFAULT_HERO_IMAGE.src||/^\/api\/platform\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return value;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&HERO_EXTERNAL_HOSTS.includes(url.hostname)&&!url.hash?url.href:'';}catch{return '';}
}
export function validateHeroImage(value:HeroImage):void{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['src','positionX','positionY','overlay'].includes(key))||typeof value.src!=='string'||(value.src&&!safeHeroImageSrc(value.src)))throw new Error('Kies een upload, de standaardfoto of een HTTPS-afbeelding van images.unsplash.com of images.pexels.com.');
 for(const [key,min,max,label] of [['positionX',0,100,'Horizontale positie'],['positionY',0,100,'Verticale positie'],['overlay',25,85,'Donkere overlay']] as const)if(!Number.isFinite(value[key])||value[key]<min||value[key]>max)throw new Error(`${label}: kies een waarde van ${min} tot ${max}.`);
}
export function normalizeHeroImage(value?:HeroImage):HeroImage{
 if(value===undefined)return {...DEFAULT_HERO_IMAGE};
 try{validateHeroImage(value);return {...value};}catch{return {...NO_HERO_IMAGE};}
}
export function heroAssetId(hero?:HeroImage):string|null{return hero?.src.match(/^\/api\/platform\/media\/([0-9a-f-]{36})$/i)?.[1]??null;}
