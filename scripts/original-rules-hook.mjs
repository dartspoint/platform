import {registerHooks} from 'node:module';
const shared=new Set(['darts-rules','darts-checkouts','darts-elo','darts-game-state','darts-match-rules','darts-tournament-model','darts-tournament-planning','darts-divisions-model','darts-practice']);
registerHooks({resolve(specifier,context,next){
 const name=specifier.split('/').at(-1)?.replace(/\.ts$/,'');
 if((specifier.startsWith('./')||specifier.startsWith('../'))&&shared.has(name))return next(new URL('../packages/game-core/src/'+name+'.ts',import.meta.url).href,context);
 if((specifier.startsWith('./')||specifier.startsWith('../'))&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);
 return next(specifier,context);
}});
