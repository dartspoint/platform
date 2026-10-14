export type TurnTimeoutWarning={player:0|1;strike:1|2;at:number;deadlineAt:number};
export type TurnTimeoutState={turn:0|1;turnStartedAt:number;timeoutStrikes?:[number,number];timeoutWarning?:TurnTimeoutWarning|null};

/** One worker observation grants one whole renewed interval; elapsed downtime
 * never consumes several strikes at once. Match/row locking is the caller's job. */
export function observeTurnTimeout(state:TurnTimeoutState,now:number,intervalMs:number){
 if(!Number.isFinite(now)||!Number.isFinite(intervalMs)||intervalMs<=0||now<state.turnStartedAt+intervalMs)return null;
 const timeoutStrikes:[number,number]=[...(state.timeoutStrikes??[0,0])];
 const strike=Math.min(3,timeoutStrikes[state.turn]+1);timeoutStrikes[state.turn]=strike;
 return {timeoutStrikes,timeoutWarning:strike<3?{player:state.turn,strike:strike as 1|2,at:now,deadlineAt:now+intervalMs}:null,turnStartedAt:now,forfeit:strike===3};
}

/** Call only after a new authoritative stop has passed every phase, sample and
 * deadline check. Receipt retries and rejected inputs never enter this path. */
export function acceptedTurnStop(state:TurnTimeoutState,player:0|1){
 const timeoutStrikes:[number,number]=[...(state.timeoutStrikes??[0,0])];timeoutStrikes[player]=0;
 return {timeoutStrikes,timeoutWarning:state.timeoutWarning?.player===player?null:state.timeoutWarning??null};
}
