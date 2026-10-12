// Original checks remain intact. Pure imports are redirected to the production shared core.
// Prototype store fixtures remain reference-only; database/transport acceptance is separate.
import {spawnSync} from 'node:child_process';
for(const name of ['dart-geometry','darts-checkouts','game-state','match-formats','competition-rules','darts-elo','tournaments','divisions']){
 const result=spawnSync(process.execPath,['--import','./scripts/original-rules-hook.mjs','reference/handoff/source-sites/scripts/check-'+name+'.mjs'],{stdio:'inherit'});if(result.status)process.exit(result.status);
}
