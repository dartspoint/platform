type DisplayState={names?:readonly string[];lastResult?:string;pendingDart?:({opponentName?:string}&object)|null;history?:object[]};
export type PublicMatchPlayer={id?:string;seat:number;name:string|null};

/** Project current public names without changing a stored state or result hash. */
export function presentMatchNames<T extends object>(state:T,players:readonly PublicMatchPlayer[],inheritedNames?:readonly string[]):T{
 if(!state||typeof state!=='object')return state;
 const source=state as T&DisplayState,original=Array.isArray(source.names)?source.names:inheritedNames;if(!original)return state;
 const names=[...original];for(const player of players)if(player.seat===0||player.seat===1)names[player.seat]=player.name??(player.id?'Speler-'+player.id.replaceAll('-','').slice(0,12):'Speler');
 let lastResult=source.lastResult;if(typeof lastResult==='string')for(let seat=0;seat<2;seat++){const old=original[seat];if(old&&names[seat]!==old&&(source.lastResult!.startsWith(old+' · ')||source.lastResult!.startsWith(old+' wint '))){lastResult=names[seat]+source.lastResult!.slice(old.length);break;}}
 return {...source,...(Array.isArray(source.names)?{names}:{}),...(typeof source.lastResult==='string'?{lastResult}:{}),...(source.pendingDart?{pendingDart:{...source.pendingDart,opponentName:names[1]}}:{}),...(Array.isArray(source.history)?{history:source.history.map(item=>presentMatchNames(item,players,original))}:{})};
}
