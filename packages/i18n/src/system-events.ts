import type {Locale} from './locale';
import {message} from './messages';
import * as common from './catalogs/common';
export type RoomJoinedEvent={schemaVersion:1;type:'room.member_joined';params:{displayName:string}};
/** The caller must establish system status from the authenticated event contract.
 * Human text is never parsed or classified here. Unknown contracts keep history. */
export function renderSystemEvent(event:unknown,locale:Locale,legacy:string) {
 const e=event as Partial<RoomJoinedEvent>|null;
 if(e?.schemaVersion===1&&e.type==='room.member_joined'&&typeof e.params?.displayName==='string'&&e.params.displayName.length<=100)return message(common[locale],locale,'rooms.memberJoined',{displayName:e.params.displayName});
 return legacy;
}
