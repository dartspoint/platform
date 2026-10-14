"use client";
import {useCallback,useLayoutEffect,useRef} from 'react';
import type {PointerEvent,MouseEvent,KeyboardEvent} from 'react';
import type {TimingInputAction,TimingInputController} from './timing-input-bootstrap';

function handled(event:Event){
 return typeof window!=='undefined'&&window.__dpTimingInputController?.handled(event)===true;
}

export function timingInput(action:()=>void){
 return {
  onPointerDown(event:PointerEvent<HTMLButtonElement>){if(handled(event.nativeEvent)||!event.isPrimary||event.button!==0)return;event.preventDefault();action();},
  onClick(event:MouseEvent<HTMLButtonElement>){if(!handled(event.nativeEvent)&&event.detail===0)action();},
  onKeyDown(event:KeyboardEvent<HTMLButtonElement>){if(handled(event.nativeEvent))return;if(event.code==='Space'||event.key==='Enter'){event.preventDefault();if(!event.repeat)action();}}
 };
}

export function useTimingInput(action:TimingInputAction){
 const committedAction=useRef(action);
 const button=useRef<HTMLButtonElement|null>(null);
 const registration=useRef<{button:HTMLButtonElement;controller:TimingInputController}|null>(null);
 const invoke=useCallback(()=>committedAction.current(),[]);
 const unregister=useCallback(()=>{
  const current=registration.current;
  if(current){current.controller.unregister(current.button,invoke);registration.current=null;}
 },[invoke]);
 const register=useCallback(()=>{
  const controller=window.__dpTimingInputController;
  if(button.current&&controller){controller.register(button.current,invoke);registration.current={button:button.current,controller};}
 },[invoke]);
 const ref=useCallback((element:HTMLButtonElement|null)=>{
  unregister();button.current=element;
  if(element)register();
 },[register,unregister]);
 useLayoutEffect(()=>{
  committedAction.current=action;
  register();
  // Register again after StrictMode's effect cleanup, even with a stable ref.
  return unregister;
 },[action,register,unregister]);
 return {ref,...timingInput(action)};
}
