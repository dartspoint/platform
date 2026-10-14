import test from 'node:test';
import assert from 'node:assert/strict';
import {observeTurnTimeout,acceptedTurnStop,type TurnTimeoutState} from '../../packages/game-core/src/turn-timeout';

test('first and second expiry renew the same turn; exactly third expiry loses',()=>{
 let state:TurnTimeoutState={turn:1,turnStartedAt:1000};
 assert.equal(observeTurnTimeout(state,30999,30000),null);
 for(const strike of [1,2,3]){
  const at=state.turnStartedAt+30000,value=observeTurnTimeout(state,at,30000)!;
  assert.equal(value.timeoutStrikes[1],strike);assert.equal(value.forfeit,strike===3);
  assert.deepEqual(value.timeoutWarning,strike<3?{player:1,strike,at,deadlineAt:at+30000}:null);
  state={...state,...value};assert.equal(state.turn,1);
  assert.equal(observeTurnTimeout(state,at,30000),null,'same worker observation cannot increment twice');
 }
});
test('a delayed worker grants a full interval rather than three instant losses',()=>{
 const value=observeTurnTimeout({turn:0,turnStartedAt:1000},500000,30000)!;
 assert.equal(value.forfeit,false);assert.equal(value.timeoutStrikes[0],1);assert.equal(value.timeoutWarning?.deadlineAt,530000);
});
test('an accepted stop clears only its own consecutive strikes, without changing turn time',()=>{
 const state:TurnTimeoutState={turn:0,turnStartedAt:1000,timeoutStrikes:[2,1],timeoutWarning:{player:0,strike:2,at:1000,deadlineAt:31000}};
 assert.deepEqual(acceptedTurnStop(state,0),{timeoutStrikes:[0,1],timeoutWarning:null});
 assert.deepEqual(state.timeoutStrikes,[2,1],'rejected/retried paths that never call helper leave state intact');
 assert.equal(state.turnStartedAt,1000);
});
