export type TurnTimeoutWarning={player:0|1;strike:1|2;at:number;deadlineAt:number};
export type TurnTimeoutDecision={player:0|1;at:number};
export type TurnTimeoutState={turn:0|1;turnStartedAt:number;turnDeadlineAt?:number|null;timeoutStrikes?:[number,number];timeoutWarning?:TurnTimeoutWarning|null;timeoutDecision?:TurnTimeoutDecision|null};
export const EXTRA_TURN_MS=60000;
export function turnDeadline(state:TurnTimeoutState,intervalMs:number){return state.turnDeadlineAt??state.turnStartedAt+intervalMs;}

/** One worker observation grants one whole renewed interval; elapsed downtime
 * never consumes several strikes at once. Match/row locking is the caller's job. */
export function observeTurnTimeout(state:TurnTimeoutState,now:number,intervalMs:number){
 if(state.timeoutDecision||!Number.isFinite(now)||!Number.isFinite(intervalMs)||intervalMs<=0||now<turnDeadline(state,intervalMs))return null;
 const timeoutStrikes:[number,number]=[...(state.timeoutStrikes??[0,0])];
 const strike=Math.min(3,timeoutStrikes[state.turn]+1);timeoutStrikes[state.turn]=strike;
 return {timeoutStrikes,timeoutWarning:strike<3?{player:state.turn,strike:strike as 1|2,at:now,deadlineAt:now+intervalMs}:null,turnStartedAt:now,turnDeadlineAt:null,timeoutDecision:strike===3?{player:state.turn,at:now}:null};
}

/** Only the waiting opponent may grant this interval, under the match row lock. */
export function extendTimedOutTurn(state:TurnTimeoutState,now:number){
 const timeoutStrikes:[number,number]=[...(state.timeoutStrikes??[0,0])];timeoutStrikes[state.turn]=2;
 return {timeoutStrikes,timeoutWarning:null,timeoutDecision:null,turnStartedAt:now,turnDeadlineAt:now+EXTRA_TURN_MS};
}

/** Call only after a new authoritative stop has passed every phase, sample and
 * deadline check. Receipt retries and rejected inputs never enter this path. */
export function acceptedTurnStop(state:TurnTimeoutState,player:0|1){
 const timeoutStrikes:[number,number]=[...(state.timeoutStrikes??[0,0])];timeoutStrikes[player]=0;
 return {timeoutStrikes,timeoutWarning:state.timeoutWarning?.player===player?null:state.timeoutWarning??null};
}
