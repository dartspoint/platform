import test from 'node:test';
import assert from 'node:assert/strict';
import {observeTurnTimeout,acceptedTurnStop,extendTimedOutTurn,turnDeadline,type TurnTimeoutState} from '../../packages/game-core/src/turn-timeout';

test('two warnings renew the same turn; third expiry waits for the opponent without forfeiting',()=>{
 let state:TurnTimeoutState={turn:1,turnStartedAt:1000};
 assert.equal(observeTurnTimeout(state,30999,30000),null);
 for(const strike of [1,2,3]){
  const at=state.turnStartedAt+30000,value=observeTurnTimeout(state,at,30000)!;
  assert.equal(value.timeoutStrikes[1],strike);
  assert.deepEqual(value.timeoutWarning,strike<3?{player:1,strike,at,deadlineAt:at+30000}:null);
  assert.deepEqual(value.timeoutDecision,strike===3?{player:1,at}:null);
  state={...state,...value};assert.equal(state.turn,1);
  assert.equal(observeTurnTimeout(state,at,30000),null,'same worker observation cannot increment twice');
 }
 assert.equal(observeTurnTimeout(state,500000,30000),null,'inaction never silently ends a pending choice');
});
test('extra time grants a whole minute and then asks again, including repeated extensions',()=>{
 let state:TurnTimeoutState={turn:0,turnStartedAt:1000,timeoutStrikes:[3,0],timeoutDecision:{player:0,at:1000}};
 for(const now of [5000,70000]){
  state={...state,...extendTimedOutTurn(state,now)};
  assert.equal(turnDeadline(state,30000),now+60000);
  assert.equal(observeTurnTimeout(state,now+59999,30000),null);
  const expired=observeTurnTimeout(state,now+60000,30000)!;
  assert.equal(expired.timeoutDecision?.player,0);state={...state,...expired};
 }
});
test('a delayed worker grants a full interval rather than consuming several warnings',()=>{
 const value=observeTurnTimeout({turn:0,turnStartedAt:1000},500000,30000)!;
 assert.equal(value.timeoutDecision,null);assert.equal(value.timeoutStrikes[0],1);assert.equal(value.timeoutWarning?.deadlineAt,530000);
});
test('an accepted stop clears only its own consecutive strikes, without changing turn time',()=>{
 const state:TurnTimeoutState={turn:0,turnStartedAt:1000,timeoutStrikes:[2,1],timeoutWarning:{player:0,strike:2,at:1000,deadlineAt:31000}};
 assert.deepEqual(acceptedTurnStop(state,0),{timeoutStrikes:[0,1],timeoutWarning:null});
 assert.deepEqual(state.timeoutStrikes,[2,1]);assert.equal(state.turnStartedAt,1000);
});
