import {unreadLabel} from '@/lib/chat-unread';
export function ChatBadge({count}:{count:number}){
 return count>0?<b className="dp-unread-badge" aria-label={`${count} ongelezen berichten`}>{unreadLabel(count)}</b>:null;
}
