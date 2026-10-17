"use client";
import {useI18n} from "@/lib/i18n/provider";
import {unreadLabel} from '@/lib/chat-unread';
export function ChatBadge({count}:{count:number}){
 const dpT = useI18n("chatBadge").t;

 return count>0?<b className="dp-unread-badge" aria-label={dpT("chatBadge.ongelezen_berichten",{count:count})}>{unreadLabel(count)}</b>:null;
}
