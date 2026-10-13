export type UnreadChannel={id:string;kind:string;name?:string;roomId?:string;matchId?:string;unread:number};
export function unreadCount(channels:readonly UnreadChannel[],roomId?:string,matchId?:string){
 const seen=new Set<string>();let total=0;
 for(const channel of channels){
  if(seen.has(channel.id))continue;seen.add(channel.id);
  if(channel.kind==='private'||channel.kind==='community'&&channel.roomId===roomId||channel.kind==='match'&&channel.matchId===matchId)total+=Math.max(0,channel.unread);
 }
 return total;
}
export function unreadLabel(count:number){return count>99?'99+':String(count);}
