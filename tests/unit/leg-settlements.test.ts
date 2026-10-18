import test from 'node:test';
import assert from 'node:assert/strict';
import {initialGameState} from '../../packages/game-core/src/darts-game-state';
import {awardForfeitLeg,matchPlayerStatistics} from '../../packages/data/src/leg-settlements';
import type {ServerGame} from '../../packages/data/src/matches';
test('giving up the second leg preserves the first leg and credits exactly the current leg, without a fake dart',()=>{
 const state={...initialGameState(0,'fixture',1,{bestOf:3}),legs:[1,0],totalLegs:[1,0]} as ServerGame;
 const result=awardForfeitLeg(state,1);
 assert.deepEqual(result.totalLegs,[1,1]);assert.deepEqual(result.legs,[1,1]);assert.deepEqual(state.totalLegs,[1,0]);
 assert.deepEqual(result.events,state.events);assert.deepEqual(result.dartCount,[0,0]);assert.deepEqual(result.pointsScored,[0,0]);assert.deepEqual(result.highestCheckout,[0,0]);
 assert.equal(matchPlayerStatistics(result,1,1).legs,1);assert.equal(matchPlayerStatistics(result,0,1).legs,1);
});
test('an administrative leg can complete a set without inventing further legs or sets',()=>{
 const state={...initialGameState(0,'fixture',1,{bestOf:3,format:'sets'}),legs:[0,1],totalLegs:[2,3],sets:[1,1]} as ServerGame;
 const result=awardForfeitLeg(state,1);assert.deepEqual(result.totalLegs,[2,4]);assert.deepEqual(result.legs,[0,2]);assert.deepEqual(result.sets,[1,2]);
});
