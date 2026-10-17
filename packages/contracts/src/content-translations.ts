export type ContentCopy=Record<string,string|string[]>;
export type ContentTranslations={en?:{source:ContentCopy;text:ContentCopy}};
export function contentCopy(item:any):ContentCopy {
 if('headline'in item)return {headline:item.headline,eyebrow:item.eyebrow};
 if('body'in item)return {title:item.title,summary:item.summary,body:item.body,ctaLabel:item.ctaLabel??''};
 return {title:item.title,description:item.description,ctaLabel:item.settings.ctaLabel??'',scoreLabel:item.settings.scoreLabel??'',...(item.type==='poll'?{pollOptions:item.settings.pollOptions??[]}:{} )};
}
export function contentTranslationCurrent(item:any){const edition=item.translations?.en;if(!edition)return false;return Object.keys(contentCopy(item)).length===Object.keys(edition.source??{}).length&&Object.entries(contentCopy(item)).every(([key,value])=>JSON.stringify(value)===JSON.stringify(edition.source[key]))&&Object.entries(contentCopy(item)).every(([key,value])=>Array.isArray(value)?Array.isArray(edition.text[key])&&edition.text[key].length===value.length&&value.every((source:string,index:number)=>typeof edition.text[key][index]==='string'&&(!source.trim()||edition.text[key][index].trim())):typeof edition.text[key]==='string'&&(!value.trim()||edition.text[key].trim()));}
export function validateContentTranslations(item:any){
 if(item.translations===undefined)return;
 if(!item.translations||typeof item.translations!=='object'||Array.isArray(item.translations)||Object.keys(item.translations).some(k=>k!=='en'))throw new Error('Invalid content translations');
 const edition=item.translations.en;if(edition===undefined)return;
 if(!edition||typeof edition!=='object'||Object.keys(edition).some(k=>!['source','text'].includes(k)))throw new Error('Invalid translation edition');
 const limits:Record<string,number>={headline:100,eyebrow:80,title:140,description:800,summary:400,body:12000,ctaLabel:80,scoreLabel:80};
 const allowed=Object.keys(contentCopy(item));
 for(const field of ['source','text']){const copy=edition[field];if(!copy||typeof copy!=='object'||Array.isArray(copy)||Object.keys(copy).some(key=>!allowed.includes(key)))throw new Error('Invalid translated fields');for(const [key,value]of Object.entries(copy)){if(key==='pollOptions'){if(!Array.isArray(value)||value.length>5||value.some(v=>typeof v!=='string'||v.length>160))throw new Error('Invalid translated options');}else if(typeof value!=='string'||value.length>limits[key])throw new Error('Invalid translated text');}}
}
