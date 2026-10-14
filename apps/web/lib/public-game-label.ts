type NumberedMatch={id:string;publicGameId?:unknown;gameNumber?:unknown;game_number?:unknown};
type MatchDirectory={matches:readonly NumberedMatch[];records:readonly NumberedMatch[]};
/** Presentation only: resource requests and model identities keep their UUIDs. */
export function publicGameLabel(platform:MatchDirectory,id:string,provided?:unknown){
 const match=platform.matches.find(value=>value.id===id)??platform.records.find(value=>value.id===id);
 const number=Number(provided??match?.publicGameId??match?.gameNumber??match?.game_number);
 return Number.isSafeInteger(number)&&number>0?`#${number}`:'—';
}
