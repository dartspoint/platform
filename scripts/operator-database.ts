/** Match delivery's session-port and verified-TLS contract without requiring
 * another runtime. Never include the supplied credential in an error. */
export function normalizeOperatorDatabaseUrl(value:string):string{
 try{
  if(typeof value!=='string'||!value||value.length>16384||/[\r\n\0]/.test(value)||value.startsWith('REPLACE_')||value.startsWith('<'))throw new Error();
  const url=new URL(value),modes=url.searchParams.getAll('sslmode');
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||url.pathname!=='/postgres'||url.hash)throw new Error();
  if(modes.length>1||modes.some(mode=>!['require','verify-full'].includes(mode)))throw new Error();
  if([...url.searchParams.keys()].some(key=>key.startsWith('ssl')&&key!=='sslmode'))throw new Error();
  // Delivery rejects malformed query pairs rather than silently discarding them.
  if(url.search.slice(1).split('&').some(pair=>pair&&!pair.includes('=')))throw new Error();
  if(url.port==='6543'&&(url.hostname.endsWith('.pooler.supabase.com')||/^db\.[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)))url.port='5432';
  if(url.port&&url.port!=='5432')throw new Error();
  url.searchParams.set('sslmode','verify-full');
  return url.href;
 }catch{throw new Error('DATABASE_URL must be a valid Supabase connection with verified TLS');}
}
