"use client";
import type {PointerEvent,MouseEvent,KeyboardEvent} from 'react';
export function timingInput(action:()=>void){
 return {
  onPointerDown(event:PointerEvent<HTMLButtonElement>){if(!event.isPrimary||event.button!==0)return;event.preventDefault();action();},
  onClick(event:MouseEvent<HTMLButtonElement>){if(event.detail===0)action();},
  onKeyDown(event:KeyboardEvent<HTMLButtonElement>){if(event.code==='Space'||event.key==='Enter'){event.preventDefault();if(!event.repeat)action();}}
 };
}
