import test from 'node:test';
import assert from 'node:assert/strict';
import {presentMatchNames} from '../../packages/data/src/match-presentation';
test('Current public names replace display snapshots without changing scores, hits or historical data',()=>{
 const stored={names:['OldA','OldB'],lastResult:'OldA · D20 — 40 punten',scores:[461,501],events:[{hit:{label:'D20',score:40}}],pendingDart:{id:1,hit:{x:.1,y:.2},opponentName:'OldB'},history:[{lastResult:'OldB wint de leg!',scores:[0,100]}]},original=JSON.stringify(stored);
 const alias=presentMatchNames(stored,[{seat:0,name:'Speler-a'},{seat:1,name:'Speler-b'}]);assert.deepEqual(alias.names,['Speler-a','Speler-b']);assert.equal(alias.lastResult,'Speler-a · D20 — 40 punten');assert.equal(alias.pendingDart.opponentName,'Speler-b');assert.equal(alias.history[0].lastResult,'Speler-b wint de leg!');assert.deepEqual(alias.scores,stored.scores);assert.deepEqual(alias.events,stored.events);assert.deepEqual(alias.pendingDart.hit,stored.pendingDart.hit);assert.equal(JSON.stringify(stored),original);
 const renamed=presentMatchNames(stored,[{seat:0,name:'SafeA'},{seat:1,name:'SafeB'}]);assert.equal(renamed.lastResult,'SafeA · D20 — 40 punten');assert.equal(JSON.stringify(stored),original,'Safe rename never rewrites stored result hash input');
});
test('A reclaimed former name is not replaced twice or inside a dart label',()=>{
 const stored={names:['OldA','OldB'],lastResult:'OldA · OldB is geen label',pendingDart:null},result=presentMatchNames(stored,[{seat:0,name:'OldB'},{seat:1,name:'SafeB'}]);assert.equal(result.lastResult,'OldB · OldB is geen label','Only the original generated prefix is a player display name');
 const dartName={names:['D20','Other'],lastResult:'Speler · D20 — 40 punten',pendingDart:null};assert.equal(presentMatchNames(dartName,[{seat:0,name:'SafeName'}]).lastResult,dartName.lastResult);
 for(const text of ['Stop je richting.','Wedstrijd beëindigd door opgave.']){const generic={names:['Stop','Wedstrijd'],lastResult:text,pendingDart:null};assert.equal(presentMatchNames(generic,[{seat:0,name:'SafeA'},{seat:1,name:'SafeB'}]).lastResult,text,'A username matching a generic status word does not rewrite that status');}
});
