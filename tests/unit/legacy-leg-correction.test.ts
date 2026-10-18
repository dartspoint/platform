import test from 'node:test';
import assert from 'node:assert/strict';
import {initialGameState,dartsGameReducer} from '../../packages/game-core/src/darts-game-state';
import {scoreDart} from '../../packages/game-core/src/darts-rules';
import {planLegacyLegCorrection} from '../../packages/data/src/legacy-leg-correction';
import type {ServerGame} from '../../packages/data/src/matches';
function firstLeg(){let state={...initialGameState(0,'legacy',1,{bestOf:3}),scores:[40,501] as [number,number],visitStart:40};state=dartsGameReducer(state,{type:'lock-x'});state=dartsGameReducer(state,{type:'launch',dart:{id:1,hit:scoreDart(0,-166/170),opponentName:'Other'}});return dartsGameReducer(state,{type:'land',id:1,at:2}) as ServerGame;}
const ledger=[{id:'a',before:'1500.0000000000',after:'1516.0000000000',delta:'16.0000000000'},{id:'b',before:'1500.0000000000',after:'1484.0000000000',delta:'-16.0000000000'}];
test('legacy correction adds the forfeited leg and only the missing rating difference',()=>{
 const state=firstLeg(),plan=planLegacyLegCorrection(state,'forfeit',0,true,ledger);
 assert.deepEqual(plan.state.totalLegs,[2,0]);assert.deepEqual(plan.state.dartCount,[1,0]);assert.equal(plan.state.events.length,1);
 assert.ok(Number(plan.adjustments[0].delta)>14&&Number(plan.adjustments[0].delta)<15);assert.equal(Number(plan.adjustments[0].delta)+Number(plan.adjustments[1].delta),0);
 assert.equal(Number(plan.ledger[0].delta),Number(plan.adjustments[0].delta)+16);
});
test('a first-leg winner retains that leg when losing the match by forfeit in leg two',()=>{
 const original=ledger.map(entry=>({...entry,after:entry.id==='a'?'1484.0000000000':'1516.0000000000',delta:entry.id==='a'?'-16.0000000000':'16.0000000000'}));
 const plan=planLegacyLegCorrection(firstLeg(),'forfeit',1,true,original);assert.deepEqual(plan.state.totalLegs,[1,1]);assert.ok(Number(plan.adjustments[0].delta)>0);assert.equal(Number(plan.ledger[0].delta)+Number(plan.ledger[1].delta),0);
});
test('repair refuses new policy, missing leg evidence and incomplete original ledgers',()=>{
 assert.throws(()=>planLegacyLegCorrection({...firstLeg(),ratingPolicyVersion:2},'forfeit',0,true,ledger));
 assert.throws(()=>planLegacyLegCorrection({...firstLeg(),events:[]},'forfeit',0,true,ledger));
 assert.throws(()=>planLegacyLegCorrection(firstLeg(),'forfeit',0,true,[]));
 assert.throws(()=>planLegacyLegCorrection({...firstLeg(),totalLegs:[2,0]},'forfeit',0,true,ledger));
});
