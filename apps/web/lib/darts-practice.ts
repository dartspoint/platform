"use client";
import {getPlatform} from './platform-client';
import {emptyPracticeProgress} from '../../../packages/game-core/src/darts-practice';
export * from '../../../packages/game-core/src/darts-practice';
const empty=emptyPracticeProgress();
export function currentPracticeProgress(){return getPlatform().practice??empty;}
export function serverPracticeProgress(){return empty;}
