"use client";
import {getPlatform,usePlatform,mutate} from "./platform-client";
export type DartsPreferences = {
  locale?: 'nl' | 'en' | null;
  favoriteRooms:string[];
  sound: boolean;
  lessMotion: boolean;
  leftHanded: boolean;
  haptics: boolean;
  quietTurn: boolean;
  privateMessages: "everyone" | "friends" | "nobody";
  availability: "available" | "playing" | "watching";
};
export const DEFAULT_DARTS_PREFERENCES: DartsPreferences = Object.freeze({ favoriteRooms:[],sound: false, lessMotion: false, leftHanded: false, haptics: true, quietTurn: false, privateMessages: "everyone", availability: "available" });
export function hydrateDartsPreferences(){}
export function getDartsPreferences():DartsPreferences{return {...DEFAULT_DARTS_PREFERENCES,...getPlatform().preferences};}
export async function updateDartsPreferences(patch:Partial<DartsPreferences>){return await mutate("preferences",patch);}
export function useDartsPreferences():DartsPreferences{usePlatform();return getDartsPreferences();}
