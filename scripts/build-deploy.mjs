import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {cp,mkdir,rm,writeFile,readFile,readdir,readlink,stat} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,relative} from 'node:path';
const command=spawnSync('npm',['run','build','--workspace','@dartspoint/web'],{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});if(command.status!==0)process.exit(command.status??1);
await rm('dist/deploy',{recursive:true,force:true});await mkdir('dist/deploy',{recursive:true});
// Preserve Next's relative dependency links so the output is relocatable into /app.
await cp('apps/web/.next/standalone','dist/deploy/web',{recursive:true,verbatimSymlinks:true});
async function checkLinks(directory,root=resolve('dist/deploy/web')){
 for(const entry of await readdir(directory,{withFileTypes:true})){const path=resolve(directory,entry.name);if(entry.isSymbolicLink()){const link=await readlink(path),target=resolve(dirname(path),link);if(isAbsolute(link)||relative(root,target).startsWith('..'))throw new Error('Standalone dependency link escapes its deployment artifact');await stat(target);}else if(entry.isDirectory())await checkLinks(path,root);}
}
await checkLinks('dist/deploy/web');
await mkdir('dist/deploy/web/apps/web/.next',{recursive:true});await cp('apps/web/.next/static','dist/deploy/web/apps/web/.next/static',{recursive:true});await cp('apps/web/public','dist/deploy/web/apps/web/public',{recursive:true});
await writeFile('dist/deploy/web/server.js',"process.env.HOSTNAME='0.0.0.0';require('./apps/web/server.js');\n");
for(const service of ['realtime','worker']){
 const directory='dist/deploy/'+service;await mkdir(directory+'/scripts',{recursive:true});
 await writeFile(directory+'/package.json',JSON.stringify({type:'module',private:true}));
 // Bundling shared domain code and dependencies avoids copying unrelated sources or secrets.
 await build({entryPoints:[`apps/${service}/src/${service==='worker'?'worker':'server'}.ts`],outfile:directory+'/server.js',bundle:true,platform:'node',format:'esm',target:'node24',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"},external:['pg-native','sharp']});
 if(service==='worker'){
  await build({entryPoints:Object.fromEntries(['apps/worker/src/support-worker.ts','scripts/migrate.ts','scripts/owner-bootstrap.ts','scripts/worker-health.ts','scripts/support-health.ts','scripts/verify-database.ts','scripts/launch-export.ts','scripts/verify-launch-storage.ts'].map(p=>[p.split('/').at(-1).replace('.ts',''),p])),outdir:directory+'/scripts',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"},external:['pg-native','sharp']});
  // Sharp's official esbuild guidance requires an external package and its
  // native binaries. Deployment is pinned to Debian/glibc linux/amd64.
  // Copy only this reviewed runtime closure, with the installed lock versions.
  const native=['@img/sharp-linux-x64','@img/sharp-libvips-linux-x64'];
  const packages=['sharp','@img/colour','detect-libc','semver',...native];
  const lock=JSON.parse(await readFile('package-lock.json','utf8'));
  for(const name of packages){
   const source='node_modules/'+name,metadata=JSON.parse(await readFile(source+'/package.json','utf8'));
   if(metadata.version!==lock.packages[source]?.version||Object.keys(metadata.dependencies??{}).some(dependency=>!packages.includes(dependency)))throw new Error('Unreviewed sharp runtime dependency: '+name);
   if(native.includes(name)&&(!metadata.os?.includes('linux')||!metadata.cpu?.includes('x64')||!metadata.libc?.includes('glibc')))throw new Error('Sharp binary does not match the pinned runtime');
   await cp(source,directory+'/'+source,{recursive:true,verbatimSymlinks:true});
  }
  await checkLinks(directory+'/node_modules',resolve(directory));
  await cp('scripts/check-worker-runtime.mjs',directory+'/scripts/check-worker-runtime.mjs');
  await cp('supabase/migrations',directory+'/supabase/migrations',{recursive:true});await cp(directory+'/scripts/worker-health.mjs',directory+'/scripts/health.mjs');
 }
}
console.log('Deployable web, realtime and worker artifacts built.');
