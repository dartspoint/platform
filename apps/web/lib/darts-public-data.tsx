"use client";
import {createContext,useContext,type ReactNode} from 'react';
export type PublicData={players:{name:string;rating:number;played:number;role:string}[];rooms:{name:string;subtitle:string;category:string;count:number;capacity:number}[];events:{id:string;name:string;description:string;status:string;startsAt:string|null;maxPlayers:number;participantCount:number;format:string;bestOf:number}[];divisions:{id:string;name:string;color:string;standings:{rank:number;name:string;played:number;wins:number;legDifference:number;points:number}[]}[]};
const Context=createContext<PublicData>({players:[],rooms:[],events:[],divisions:[]});
export function PublicDataProvider({data,children}:{data:PublicData;children:ReactNode}){return <Context.Provider value={data}>{children}</Context.Provider>;}
export function usePublicData(){const data=useContext(Context);return {PUBLIC_LADDER:data.players,PUBLIC_ROOMS:data.rooms,PUBLIC_EVENTS:data.events,PUBLIC_DIVISIONS:data.divisions};}
