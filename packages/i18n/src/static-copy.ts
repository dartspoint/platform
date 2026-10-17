import type {Catalog,Values} from './messages';
/** Only explicitly registered, developer-authored constants use this helper.
 * Never pass API projections, chat, names, tickets or CMS content here. */
export function localiseStaticCopy<T>(value:T, translate:(key:string,values?:Values)=>string, keys:Record<string,string>):T {
 if(typeof value==='string')return (keys[value]?translate(keys[value]):value) as T;
 if(Array.isArray(value))return value.map(item=>localiseStaticCopy(item,translate,keys)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,typeof item==='function'?item:localiseStaticCopy(item,translate,keys)])) as T;
 return value;
}
