"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMotionValue } from "motion/react";
import { ArrowLeft, Check, MonitorPlay, ShieldCheck, Trophy } from "lucide-react";
import { GamePanel, type DartsGame } from "@/components/darts-game";
import { dartsGameReducer, initialGameState, normalizeGameRules } from "@/lib/darts-game-state";
import { DART_NUMBERS, opponentTarget, scoreDart } from "@/lib/darts-rules";
import { useDartsPreferences } from "@/lib/darts-preferences";
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
export function CompetitionGame({ gameId, opponentName, startScore = 501, doubleOut = true, bestOf, canPlay, onComplete, onClose, checkoutHints = true }: CompetitionGameProps) {
  const rules = normalizeGameRules({ startScore, doubleOut, bestOf, doubleIn: false, format: "legs" });
  const storageKey = `dartspoint-competition-match-v1:${gameId}`;
  const [state, dispatch] = useReducer(dartsGameReducer, undefined, () => initialGameState(0, gameId, 0, rules));
  const [hydrated, setHydrated] = useState(false);
  const [isActive, setActive] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const xMeter = useMotionValue(.5), yMeter = useMotionValue(.5);
  const lockedX = useRef(.5), sequence = useRef(0);
  const preferences = useDartsPreferences();
  const playable = canPlay && hydrated && accepted;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.version === 1 && saved.opponentName === opponentName && saved.state?.id === gameId && JSON.stringify(saved.state.rules) === JSON.stringify(rules) && Array.isArray(saved.state.events) && Array.isArray(saved.state.scores)) {
        const restored = { ...saved.state, history: [], phase: saved.state.phase === "vertical" ? "horizontal" : saved.state.phase };
        dispatch({ type: "restore", state: restored });
        sequence.current = Math.max(0, ...restored.events.map((event: { id: number }) => event.id), restored.pendingDart?.id ?? 0);
        setAccepted(true);
      } else dispatch({ type: "reset", id: gameId, at: Date.now(), rules });
    } catch { dispatch({ type: "reset", id: gameId, at: Date.now(), rules }); }
    setHydrated(true);
    // The parent keys this component by game ID. Rules cannot change mid-match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated || !canPlay) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, opponentName, state: { ...state, history: [] } })); } catch { /* Gameplay still works when local storage is unavailable. */ }
  }, [state, hydrated, canPlay, storageKey, opponentName]);

  useEffect(() => {
    if (!playable || !isActive || !["horizontal", "vertical"].includes(state.phase)) return;
    let frame = 0, started: number | null = null;
    const meter = state.phase === "horizontal" ? xMeter : yMeter;
    const duration = state.phase === "horizontal" ? 2200 : 2500;
    const tick = (now: number) => { if (started === null) started = now; const part = ((now - started) / duration + .25) % 1; meter.set(part < .5 ? part * 2 : 2 - part * 2); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playable, isActive, state.phase, xMeter, yMeter]);

  useEffect(() => {
    if (!playable || !isActive || state.phase !== "opponent") return;
    const timer = setTimeout(() => {
      let hit = opponentTarget(state.scores[1]);
      if (!doubleOut && state.scores[1] <= 20) {
        const index = DART_NUMBERS.indexOf(state.scores[1] as typeof DART_NUMBERS[number]);
        const angle = index * Math.PI / 10;
        hit = scoreDart(Math.sin(angle) * .45, -Math.cos(angle) * .45);
      }
      dispatch({ type: "launch", dart: { id: ++sequence.current, hit, opponentName } });
    }, state.freshVisit ? 1250 : 850);
    return () => clearTimeout(timer);
  }, [playable, isActive, state.phase, state.dartsLeft, state.freshVisit, state.scores, opponentName, doubleOut]);

  const startOrStop = useCallback(() => {
    if (!playable) return;
    if (preferences.haptics && navigator.vibrate) navigator.vibrate(12);
    if (state.phase === "horizontal") { lockedX.current = xMeter.get(); dispatch({ type: "lock-x" }); }
    else if (state.phase === "vertical") dispatch({ type: "launch", dart: { id: ++sequence.current, hit: scoreDart((lockedX.current - .5) * 2.28, (yMeter.get() - .5) * 2.28), opponentName } });
  }, [playable, state.phase, preferences.haptics, xMeter, yMeter, opponentName]);
  const landDart = useCallback((id: number) => { if (!playable) return; dispatch({ type: "land", id, at: Date.now() }); if (preferences.haptics && navigator.vibrate) navigator.vibrate(22); }, [playable, preferences.haptics]);
  const noOp = useCallback(() => {}, []);
  const compactId = `C-${Array.from(gameId).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261).toString(36).replace("-", "").toUpperCase()}`;
  const game: DartsGame = {
    ...state, id: compactId, xMeter, yMeter, startOrStop, landDart, setActive,
    reset: noOp, startNewMatch: noOp, rematch: noOp, undo: noOp, canUndo: false,
    averages: state.dartCount.map((count, i) => count ? state.pointsScored[i] / count * 3 : 0) as [number, number],
    opponentName, ready: playable, preparing: false, beginMatch: async () => {}, mode: "casual", modeLabel: "Lokale competitiedemo",
    offlineUntil: null, remainingReconnect: 60, reconnect: noOp, simulateDisconnect: noOp,
    reconnected: false, sending: false, verification: "local", connectionMessage: "", ratingChange: undefined, preferences,
  };
  function finish() {
    setError("");
    try { onComplete([...state.legs]); try { localStorage.removeItem(storageKey); } catch {} }
    catch (cause) { setError(cause instanceof Error ? cause.message : "De uitslag kon niet worden opgeslagen."); }
  }

  return <section className="dpc-match" aria-label="Competitiewedstrijd">
    <header className="dpc-match-top"><div>{onClose && <button onClick={onClose} aria-label="Terug naar de competitie"><ArrowLeft size={18}/></button>}<span><strong>{startScore} · {doubleOut ? "Double-out" : "Single-out"}</strong><small>Best of {bestOf} legs · opgeslagen op dit apparaat</small></span></div><span className="dpc-demo-tag"><MonitorPlay size={13}/>DEMO</span></header>
    <p className="dpc-match-notice"><ShieldCheck size={14}/>Je speelt tegen een automatische demotegenstander. Alleen de lokale competitie-uitslag verandert; Elo blijft gelijk.</p>
    {!canPlay ? <div className="dpc-match-gate"><ShieldCheck size={24}/><h3>Alleen kijken</h3><p>Je hebt geen speelrecht voor deze wedstrijd. De bewaarde stand blijft zichtbaar.</p></div> : !accepted && <div className="dpc-match-gate"><h3>Nick versus {opponentName}</h3><p>Je speelt de volledige partij met de ingestelde spelregels. Stop eerst je richting, daarna je hoogte.</p><button className="dpc-primary" onClick={() => setAccepted(true)} disabled={!hydrated}>Start de demopartij</button></div>}
    <div className="darts-app dp-fullscreen dpc-game-surface"><GamePanel key={playable ? "playing" : "paused"} game={game} variant="club" muted={!preferences.sound} lessMotion={preferences.lessMotion} interactionBlocked={!playable || state.phase === "won"} showExperience={false} checkoutHints={checkoutHints}/></div>
    {state.bustReason && state.phase !== "won" && <p className="dpc-result-note" role="status">{state.bustReason}</p>}
    {state.phase === "won" && <div className="dpc-match-finished" role="status"><Trophy size={25}/><div><h3>{state.winner === 0 ? "Nick" : opponentName} wint · {state.legs[0]}–{state.legs[1]}</h3><p>Leguitslag van deze gespeelde demopartij.</p></div>{canPlay && <button className="dpc-primary" onClick={finish}><Check size={15}/>Uitslag vastleggen</button>}</div>}
    {error && <p className="dpc-match-error" role="alert">{error}</p>}
  </section>;
}
