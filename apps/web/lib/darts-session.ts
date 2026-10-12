"use client";
import {api,getPlatform} from './platform-client';
export async function endDemoSession(){await api('auth/logout',{});window.location.assign('/inloggen');}
export function readDemoSession(){return !!getPlatform().actor;}
export function readDemoSessionProfile(){return getPlatform().actor;}
