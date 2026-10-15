"use client";
import {GamePanel} from "./darts-game";
import {useServerGame} from "@/lib/use-server-game";
import {getPlatform,usePlatform,refreshPlatform,selfName} from "@/lib/platform-client";
import {ShieldCheck,Trophy,Check,ArrowLeft} from "lucide-react";
import "./darts-app.css";
import "./darts-play-shell.css";
import "./darts-competition-game.css";
export type CompetitionGameProps = {
  gameId: string; opponentName: string; startScore?: 301 | 501 | 701;
  doubleOut?: boolean; bestOf: number; canPlay: boolean;
  onComplete: (score: [number, number]) => void;
  onClose?: () => void; checkoutHints?: boolean;
};

/** Isolated local competition match. Never touches free-play saves or Elo. */
export function CompetitionGame({gameId,opponentName,canPlay,onClose,onComplete,checkoutHints=true}:CompetitionGameProps){
 const platform=usePlatform();const assignment=platform.matches.find(m=>m.id===gameId||(m.competition&&gameId.includes(m.competition.id)&&gameId.includes(m.competition.nodeId??m.competition.fixtureId)));
 const game=useServerGame(opponentName,assignment?.id??gameId);
 return <section className="dpc-match" aria-label="Competitiewedstrijd"><header className="dpc-match-header"><span>OFFICIËLE WEDSTRIJD</span>{onClose&&<button onClick={onClose}><ArrowLeft size={15}/>Terug naar de competitie</button>}</header><p className="dpc-match-notice">Je speelt tegen je ingedeelde tegenstander.</p>
 {!canPlay&&<div className="dpc-match-gate"><ShieldCheck size={24}/><h3>Alleen kijken</h3><p>De actuele stand blijft zichtbaar.</p></div>}
 <div className="darts-app dp-fullscreen dpc-game-surface"><GamePanel game={game} variant="club" muted={!game.preferences.sound} lessMotion={game.preferences.lessMotion} interactionBlocked={!canPlay||game.phase==="won"} showExperience={false} checkoutHints={checkoutHints}/></div>
 {game.bustReason&&game.phase!=="won"&&<p className="dpc-result-note" role="status">{game.bustReason}</p>}
 {game.phase==="won"&&<div className="dpc-match-finished" role="status"><Trophy size={25}/><div><h3>{game.winner===0?game.playerName:game.opponentName} wint · {game.legs[0]}–{game.legs[1]}</h3></div>{canPlay&&<button className="dpc-primary" onClick={async()=>{await refreshPlatform();onComplete([...game.legs]);}}><Check size={15}/>Bekijk de bijgewerkte competitie</button>}</div>}
 </section>;
}
