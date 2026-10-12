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
 await build({entryPoints:[`apps/${service}/src/${service==='worker'?'worker':'server'}.ts`],outfile:directory+'/server.js',bundle:true,platform:'node',format:'esm',target:'node24',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"},external:['pg-native']});
 if(service==='worker'){
  await build({entryPoints:['scripts/migrate.ts','scripts/owner-bootstrap.ts','scripts/worker-health.ts'],outdir:directory+'/scripts',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"},external:['pg-native']});
  await cp('supabase/migrations',directory+'/supabase/migrations',{recursive:true});await cp(directory+'/scripts/worker-health.mjs',directory+'/scripts/health.mjs');
 }
}
console.log('Deployable web, realtime and worker artifacts built.');
