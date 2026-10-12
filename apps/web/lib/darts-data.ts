"use client";
import {getPlatform} from "./platform-client";
export type PlayerStatus = "Speelt" | "Kijkt mee" | "Beschikbaar";
export type PlayerRole = "owner" | "admin" | "vip" | "player";
export type DartsPlayer = {
  id?: string;
  rankedPlayed?: number;
  distinctOpponents?: number;
  name: string;
  role: PlayerRole;
  rating: number;
  average: number;
  status: PlayerStatus;
  initials: string;
  wins: number;
  played: number;
  oneEighties: number;
  country: string;
};

function liveArray<T>(read:()=>T[]):T[]{return new Proxy([] as T[],{get(_target,key){const value=Reflect.get(read(),key);return typeof value==="function"?value.bind(read()):value;}});}
export const players:DartsPlayer[]=liveArray(()=>getPlatform().players);
export const rooms=liveArray(()=>getPlatform().rooms);
export function ratingTone(rating: number, played = 0, distinctOpponents = played >= 10 ? 5 : 0) {
  if (played < 10 || distinctOpponents < 5) return "rating-white";
  const displayed = Math.round(rating);
  return displayed >= 1550 ? "rating-green" : displayed < 1450 ? "rating-red" : "rating-amber";
}

export function playerByName(name:string):DartsPlayer{return getPlatform().players.find(p=>p.name===name)??{name,role:"player",rating:1500,average:0,status:"Beschikbaar",initials:name.slice(0,2).toUpperCase()||"?",wins:0,played:0,oneEighties:0,country:""};}
