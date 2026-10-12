"use client";

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowDown, ArrowUp, ArrowRight, ArrowUpRight, RotateCcw } from "lucide-react";
import { BOARD_GEOMETRY, DART_NUMBERS, dartPoseAt, dartTipPosition, dartTransform, opponentTarget, scoreDart, type DartHit } from "@/lib/darts-rules";
import { dartsGameReducer, initialGameState, type BoardDart } from "@/lib/darts-game-state";
import { MATCH_AUTO_START_KEY, matchRulesLabel, matchFormatLabel, readMatchSetup, selectMatchSetup, type MatchSetup } from "@/lib/darts-match-setup";
import { PlayerName, RatingValue } from "@/components/player-identity";
import { playerByName } from "@/lib/darts-data";
import { getCheckoutRoutes } from "@/lib/darts-checkouts";
import { getMatchRecords, saveMatchRecord, type MatchMode, type MatchRatingChange } from "@/lib/darts-match-records";
import { useDartsPreferences } from "@/lib/darts-preferences";
import { completeRatedMatch } from "@/lib/darts-ratings";
import { startFairPlayGame, submitFairPlayThrow, requestFairPlayBot, forfeitFairPlayGame } from "@/lib/darts-fair-play-client";
import { MatchExperience } from "@/components/darts-match-experience";
type FairPlaySession = Awaited<ReturnType<typeof startFairPlayGame>>;
import "./darts-game.css";
import "./darts-playfield.css";

const ACTIVE_MATCH_KEY = "dartspoint-active-match-v2";
const modeLabels: Record<MatchMode, string> = { "ranked-demo": "Elo-demo", casual: "Vrij spelen", practice: "Oefenen", bot: "Tegen de computer" };
const newMatchId = () => String(Date.now()).slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, "0");

export function useDartsGame(initialOpponentName = "Bullseye") {
  const [state, dispatch] = useReducer(dartsGameReducer, undefined, () => initialGameState());
  const [opponentName, setOpponentName] = useState(initialOpponentName);
  const [isActive, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoBegin, setAutoBegin] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<MatchMode>("casual");
  const [offlineUntil, setOfflineUntil] = useState<number | null>(null);
  const [remainingReconnect, setRemainingReconnect] = useState(60);
  const [reconnected, setReconnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [fairPlay, setFairPlay] = useState<FairPlaySession | null>(null);
  const [verification, setVerification] = useState<"local" | "server" | "connecting">("local");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [ratingChange, setRatingChange] = useState<MatchRatingChange | undefined>();
  const xMeter = useMotionValue(.5);
  const yMeter = useMotionValue(.5);
  const lockedX = useRef(.5);
  const lockStarted = useRef(0);
  const flightId = useRef(0);
  const generation = useRef(0);
  const submitBusy = useRef(false);
  const beginBusy = useRef(false);
  const restored = useRef(false);
  const fairPlayRef = useRef<FairPlaySession | null>(null);
  const serverSequence = useRef(0);
  const retryThrow = useRef<{ x: number; y: number; bot: boolean; elapsedMs: number; sequence: number } | null>(null);
  const preferences = useDartsPreferences();

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const savedMode = sessionStorage.getItem("dartspoint-match-mode-v1");
      if (savedMode === "ranked-demo" || savedMode === "casual" || savedMode === "bot") setMode(savedMode);
      const fresh = sessionStorage.getItem("dartspoint-new-match-v1") === "1";
      const selectedSetup = readMatchSetup();
      const selectedOpponent = sessionStorage.getItem("dartspoint-opponent-v1") || initialOpponentName;
      const startAutomatically = fresh && sessionStorage.getItem(MATCH_AUTO_START_KEY) === "1";
      setOpponentName(selectedOpponent);
      sessionStorage.removeItem("dartspoint-new-match-v1");
      sessionStorage.removeItem(MATCH_AUTO_START_KEY);
      const raw = fresh ? null : sessionStorage.getItem(ACTIVE_MATCH_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.version === 2 && Array.isArray(saved.state?.events) && Array.isArray(saved.state?.scores) && saved.mode === (savedMode || "casual") && saved.room === (sessionStorage.getItem("dartspoint-room-v1") || "Nederland 1") && saved.opponent === selectedOpponent) {
        dispatch({ type: "restore", state: { ...saved.state, phase: saved.state.phase === "vertical" && !saved.retryThrow ? "horizontal" : saved.state.phase, history: [] } });
        setMode(saved.mode); setReady(saved.ready); setRatingChange(saved.ratingChange);
        flightId.current = Math.max(0, ...saved.state.events.map((event: { id: number }) => event.id), saved.state.pendingDart?.id ?? 0);
        if (saved.fairPlay) { setFairPlay(saved.fairPlay); fairPlayRef.current = saved.fairPlay; serverSequence.current = saved.serverSequence ?? 0; setVerification("server"); }
        if (saved.offlineUntil) setOfflineUntil(saved.offlineUntil);
        if (saved.retryThrow) retryThrow.current = saved.retryThrow;
        if (saved.ready && saved.state.phase !== "won") setReconnected(true);
      } else { dispatch({ type: "reset", id: newMatchId(), at: Date.now(), starter: Math.random() < .5 ? 0 : 1, rules: selectedSetup.rules }); setAutoBegin(startAutomatically); }
    } catch { dispatch({ type: "reset", id: newMatchId(), at: Date.now() }); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({ version: 2, room: sessionStorage.getItem("dartspoint-room-v1") || "Nederland 1", retryThrow: retryThrow.current, state: { ...state, history: [] }, opponent: opponentName, mode, ready, fairPlay, serverSequence: serverSequence.current, offlineUntil, ratingChange })); } catch {}
  }, [state, opponentName, mode, ready, hydrated, fairPlay, offlineUntil, ratingChange, sending]);

  const reconnect = useCallback(() => { setOfflineUntil(null); setReconnected(true); setConnectionMessage(""); }, []);
  const simulateDisconnect = useCallback(() => { setOfflineUntil(Date.now() + 60_000); setRemainingReconnect(60); setReconnected(false); }, []);
  useEffect(() => {
    if (!ready || state.phase === "won") return;
    const offline = () => simulateDisconnect();
    const online = () => reconnect();
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [ready, state.phase, simulateDisconnect, reconnect]);
  useEffect(() => {
    if (!offlineUntil) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((offlineUntil - Date.now()) / 1000));
      setRemainingReconnect(seconds);
      if (seconds === 0) { generation.current += 1; retryThrow.current = null; if (fairPlayRef.current) void forfeitFairPlayGame(fairPlayRef.current).catch(() => {}); dispatch({ type: "forfeit", player: 0 }); setOfflineUntil(null); setSending(false); }
    };
    tick(); const timer = setInterval(tick, 500); return () => clearInterval(timer);
  }, [offlineUntil]);
  useEffect(() => { if (!reconnected) return; const timer = setTimeout(() => setReconnected(false), 3200); return () => clearTimeout(timer); }, [reconnected]);

  const beginMatch = useCallback(async () => {
    if (beginBusy.current || sending || ready) return;
    beginBusy.current = true;
    const requestGeneration = generation.current;
    setSending(true); setVerification("connecting");
    try {
      const session = await startFairPlayGame({ opponent: opponentName, mode: mode === "ranked-demo" ? "ranked" : "casual", starter: state.starter, rules: state.rules });
      if (requestGeneration !== generation.current) return;
      fairPlayRef.current = session; setFairPlay(session); serverSequence.current = session.state.sequence; setVerification("server");
    } catch {
      if (requestGeneration !== generation.current) return;
      fairPlayRef.current = null; setFairPlay(null); setVerification("local");
      setConnectionMessage("Lokale demowedstrijd: servercontrole is nu niet beschikbaar.");
    } finally {
      if (requestGeneration === generation.current) { beginBusy.current = false; setSending(false); setReady(true); }
    }
  }, [mode, opponentName, ready, sending, state.starter, state.rules]);

  useEffect(() => {
    if (!hydrated || !autoBegin || ready || sending) return;
    setAutoBegin(false);
    void beginMatch();
  }, [hydrated, autoBegin, ready, sending, beginMatch]);

  const launch = useCallback(async (x: number, y: number, bot: boolean) => {
    if (submitBusy.current || offlineUntil || !ready || state.pendingDart) return;
    submitBusy.current = true; setSending(true);
    const requestGeneration = generation.current;
    const attempt = retryThrow.current || { x, y, bot, sequence: serverSequence.current + 1, elapsedMs: Math.max(120, Math.min(120000, Date.now() - lockStarted.current)) };
    retryThrow.current = attempt;
    let hit = attempt.bot ? opponentTarget(state.scores[1], state.rules.doubleIn && !state.opened[1]) : scoreDart(attempt.x, attempt.y);
    try {
      const session = fairPlayRef.current;
      if (session) {
        const result = attempt.bot
          ? await requestFairPlayBot(session, { sequence: attempt.sequence })
          : await submitFairPlayThrow(session, { sequence: attempt.sequence, x: attempt.x, y: attempt.y, elapsedMs: attempt.elapsedMs });
        if (requestGeneration !== generation.current) return;
        hit = result.hit; serverSequence.current = result.sequence;
        const updatedSession = { ...session, state: result.state };
        fairPlayRef.current = updatedSession; setFairPlay(updatedSession);
      }
      if (requestGeneration !== generation.current) return;
      retryThrow.current = null;
      dispatch({ type: "launch", dart: { id: ++flightId.current, hit, opponentName } });
    } catch {
      if (requestGeneration !== generation.current) return;
      setConnectionMessage("Worp nog niet bevestigd. Herstel je verbinding en probeer opnieuw.");
      simulateDisconnect();
    } finally {
      if (requestGeneration === generation.current) { submitBusy.current = false; setSending(false); }
    }
  }, [offlineUntil, opponentName, ready, simulateDisconnect, state.pendingDart, state.scores, state.rules.doubleIn, state.opened]);

  useEffect(() => { const attempt = retryThrow.current; if (attempt && ready && !offlineUntil && !sending) void launch(attempt.x, attempt.y, attempt.bot); }, [launch, ready, offlineUntil, sending]);

  useEffect(() => {
    if (!isActive || !ready || offlineUntil || sending || (state.phase !== "horizontal" && state.phase !== "vertical")) return;
    let frame = 0; let start: number | null = null;
    const meter = state.phase === "horizontal" ? xMeter : yMeter;
    const duration = state.phase === "horizontal" ? 2200 : 2500;
    const tick = (now: number) => { if (start === null) start = now; const progress = ((now - start) / duration + .25) % 1; meter.set(progress < .5 ? progress * 2 : 2 - progress * 2); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [state.phase, xMeter, yMeter, isActive, ready, offlineUntil, sending]);

  useEffect(() => {
    if (!isActive || !ready || offlineUntil || sending || state.phase !== "opponent") return;
    const timer = window.setTimeout(() => void launch(0, 0, true), state.freshVisit ? 1300 : 850);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.dartsLeft, state.freshVisit, isActive, ready, offlineUntil, sending, launch]);

  const startOrStop = useCallback(() => {
    if (!ready || offlineUntil || sending) return;
    if (preferences.haptics && navigator.vibrate) navigator.vibrate(12);
    if (state.phase === "horizontal") { lockedX.current = xMeter.get(); lockStarted.current = Date.now(); dispatch({ type: "lock-x" }); }
    else if (state.phase === "vertical") void launch((lockedX.current - .5) * 2.28, (yMeter.get() - .5) * 2.28, false);
  }, [state.phase, launch, xMeter, yMeter, ready, offlineUntil, sending, preferences.haptics]);
  const clearSession = useCallback(() => {
    generation.current += 1; submitBusy.current = false; beginBusy.current = false; setSending(false); setReady(false); setOfflineUntil(null); setRatingChange(undefined); setReconnected(false);
    fairPlayRef.current = null; setFairPlay(null); serverSequence.current = 0; retryThrow.current = null; setVerification("local"); setConnectionMessage("");
    // Keep IDs monotonic so an old animation cannot land a dart in a new match.
    xMeter.set(.5); yMeter.set(.5);
  }, [xMeter, yMeter]);
  const reset = useCallback((starter?: 0 | 1) => {
    clearSession();
    dispatch({ type: "reset", id: newMatchId(), at: Date.now(), starter: starter ?? (Math.random() < .5 ? 0 : 1), rules: state.rules });
    setAutoBegin(true);
  }, [clearSession, state.rules]);
  const startNewMatch = useCallback((nextOpponent: string, input: MatchSetup) => {
    const setup = selectMatchSetup(nextOpponent, input);
    // This instance starts immediately. The persisted selection remains for reloads.
    try { sessionStorage.removeItem("dartspoint-new-match-v1"); sessionStorage.removeItem(MATCH_AUTO_START_KEY); } catch {}
    clearSession(); setOpponentName(nextOpponent); setMode(setup.ranked ? "ranked-demo" : "casual");
    dispatch({ type: "reset", id: newMatchId(), at: Date.now(), starter: Math.random() < .5 ? 0 : 1, rules: setup.rules });
    setAutoBegin(true);
  }, [clearSession]);
  const rematch = useCallback(() => reset((1 - state.starter) as 0 | 1), [reset, state.starter]);
  const undo = useCallback(() => { if (!fairPlayRef.current && mode !== "ranked-demo") dispatch({ type: "undo" }); }, [mode]);
  const landDart = useCallback((id: number) => { dispatch({ type: "land", id, at: Date.now() }); if (preferences.haptics && navigator.vibrate) navigator.vibrate(22); }, [preferences.haptics]);
  const averages: [number, number] = [0, 1].map(i => state.dartCount[i] ? state.pointsScored[i] / state.dartCount[i] * 3 : 0) as [number, number];

  useEffect(() => {
    if (!hydrated || state.winner === null || !state.startedAt) return;
    const existing = getMatchRecords().find(match => match.id === state.id);
    if (existing) { setRatingChange(existing.ratingChange); return; }
    const result = completeRatedMatch({ id: state.id, a: "Nick", b: opponentName, winner: state.winner, mode });
    const change: MatchRatingChange = result;
    saveMatchRecord({ id: state.id, opponent: opponentName, mode, winner: state.winner, legs: state.totalLegs, totalLegs: state.totalLegs, sets: state.sets, rules: state.rules, averages: [state.dartCount[0] ? state.pointsScored[0] / state.dartCount[0] * 3 : 0, state.dartCount[1] ? state.pointsScored[1] / state.dartCount[1] * 3 : 0], highestVisit: state.highestVisit, highestCheckout: state.highestCheckout, darts: state.dartCount, events: state.events, startedAt: state.startedAt, endedAt: Date.now(), ratingChange: change, forfeit: state.forfeit });
    setRatingChange(change);
  }, [hydrated, state.winner, state.id, state.startedAt, state.totalLegs, state.sets, state.rules, state.dartCount, state.pointsScored, state.highestVisit, state.highestCheckout, state.events, state.forfeit, mode, opponentName]);

  return { ...state, xMeter, yMeter, startOrStop, reset, startNewMatch, rematch, undo, canUndo: state.phase !== "won" && !fairPlay && mode !== "ranked-demo" && (state.history.length > 0 || state.pendingDart !== null), landDart, averages, opponentName, setActive, ready, preparing: !hydrated || autoBegin || (sending && !ready), beginMatch, mode, modeLabel: modeLabels[mode], offlineUntil, remainingReconnect, reconnect, simulateDisconnect, reconnected, sending, verification, connectionMessage, ratingChange, preferences };
}

export type DartsGame = ReturnType<typeof useDartsGame>;

function point(radius: number, angle: number): [number, number] {
  return [BOARD_GEOMETRY.center + Math.sin(angle * Math.PI / 180) * radius, BOARD_GEOMETRY.center - Math.cos(angle * Math.PI / 180) * radius];
}

function segment(inner: number, outer: number, angle: number) {
  const a = point(outer, angle - 9), b = point(outer, angle + 9), c = point(inner, angle + 9), d = point(inner, angle - 9);
  return `M${a[0]},${a[1]} A${outer},${outer} 0 0 1 ${b[0]},${b[1]} L${c[0]},${c[1]} A${inner},${inner} 0 0 0 ${d[0]},${d[1]} Z`;
}

function DartVisual({ dart, flying, uid, onLand, lessMotion }: { dart: BoardDart; flying: boolean; uid: string; onLand: (id: number) => void; lessMotion: boolean }) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = lessMotion || systemReducedMotion;
  const flightAtMount = useRef(flying).current;
  const settled = useRef(!flying);
  const visual = useRef<SVGGElement>(null);
  const { hit, id } = dart;
  const { x, y } = dartTipPosition(hit);
  const finalPose = dartPoseAt(hit, 1);
  const rotation = finalPose.rotation;
  const duration = .56;
  const shouldAnimate = flightAtMount && !settled.current && !reducedMotion;
  const initialPose = dartPoseAt(hit, shouldAnimate ? 0 : 1);
  const complete = useCallback(() => {
    if (!flying || settled.current) return;
    settled.current = true;
    onLand(id);
  }, [flying, id, onLand]);
  useEffect(() => {
    const draw = (progress: number) => {
      const pose = dartPoseAt(hit, progress);
      visual.current?.setAttribute("transform", dartTransform(pose));
      visual.current?.setAttribute("opacity", String(pose.opacity));
    };
    if (!shouldAnimate) {
      draw(1);
      if (reducedMotion) complete();
      return;
    }
    // Animate the native SVG attribute. Motion's CSS SVG transforms default
    // to fill-box, which moves (0, 0) to the dart's negative-x bounding box.
    // This keeps the actual tip, the hit test and the final landing identical.
    const flight = animate(0, 1, {
      duration, ease: [.2, .68, .35, 1], onUpdate: draw,
      onComplete: () => { draw(1); complete(); },
    });
    return () => flight.stop();
  }, [hit, shouldAnimate, reducedMotion, complete]);

  return <g>
    <motion.ellipse cx={x + 7} cy={y + 14} rx="4" ry="19" fill="#000" transform={`rotate(${rotation - 15},${x + 7},${y + 14})`} initial={shouldAnimate ? { opacity: 0 } : false} animate={{ opacity: .3 }} transition={{ delay: shouldAnimate ? duration - .07 : 0, duration: .12 }} />
    {shouldAnimate && <motion.circle cx={x} cy={y} fill="none" stroke="#d4f5df" strokeWidth="1" initial={{ r: 2, opacity: 0 }} animate={{ r: [2, 5, 13], opacity: [0, .58, 0] }} transition={{ delay: duration - .04, duration: .32, times: [0, .2, 1] }} />}
    {!flying && <circle cx={x} cy={y} r="1.2" fill="#06100b" opacity=".8" />}
    <g
      ref={visual}
      className="dp-flying-dart"
      transform={dartTransform(initialPose)}
      opacity={initialPose.opacity}
    >
      <path d="M0 0 L0 13" stroke="#dfe9e4" strokeWidth="1.3" strokeLinecap="butt" />
      <path d="M0 3 L.6 13" stroke="#697f75" strokeWidth=".7" />
      <path d="M-1.8 12 L-2.8 17 L-2.6 28 L0 31 L2.6 28 L2.8 17 L1.8 12 Z" fill={`url(#${uid}-steel)`} stroke="#59665e" strokeWidth=".4" />
      <path d="M-2.5 18 H2.5 M-2.5 21 H2.5 M-2.5 24 H2.5 M-2.1 27 H2.1" stroke="#414e46" strokeWidth=".75" />
      <path d="M-.6 14 V27" stroke="#fff" strokeWidth=".65" opacity=".7" />
      <path d="M0 30 V45" stroke="#8e9c94" strokeWidth="2" />
      <path d="M.6 31 V43" stroke="#eff6f0" strokeWidth=".5" />
      <path d="M0 36 L-7.5 43 L-8 56 L0 50 L8 56 L7.5 43 Z" fill={`url(#${uid}-flight)`} stroke="#901829" strokeWidth=".6" />
      <path d="M0 37 V50 L-7.5 54 L-5 43 Z" fill="#ff6c71" opacity=".6" />
      <path d="M0 37 V50 L7.5 54 L5 43 Z" fill="#a8162a" opacity=".6" />
      <path d="M0 37 V51" stroke="#ffd1cf" strokeWidth=".8" />
      <path d="M-6 44 L-6.5 52" stroke="#ffb1ad" strokeWidth=".65" opacity=".75" />
    </g>
  </g>;
}

function LandedDartChip({ dart, lessMotion }: { dart: BoardDart; lessMotion: boolean }) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = lessMotion || systemReducedMotion;
  const { x: tipX, y: tipY } = dartTipPosition(dart.hit);
  const width = Math.max(48, dart.hit.label.length * 10 + 22);
  const height = 29;
  // Keep missed darts and hits near the rim readable inside the SVG viewport.
  const x = Math.max(width / 2 + 8, Math.min(432 - width / 2, tipX));
  const y = Math.max(8, Math.min(397, tipY - 48));
  const pointerX = Math.max(-width / 2 + 10, Math.min(width / 2 - 10, tipX - x));

  return <g transform={`translate(${x},${y})`} pointerEvents="none" aria-hidden="true">
    <motion.g
      initial={reducedMotion ? false : { opacity: 0, y: 5, scale: .92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : .18, ease: "easeOut" }}
      style={{ originX: "0px", originY: "29px", filter: "drop-shadow(0 3px 4px rgb(0 0 0 / .35))" }}
    >
      <path d={`M${pointerX - 5} ${height - 1} L${pointerX} ${height + 5} L${pointerX + 5} ${height - 1} Z`} fill="#eae1b5" />
      <rect x={-width / 2} y="0" width={width} height={height} rx="10" fill="#eae1b5" stroke="#fff7d5" strokeWidth=".8" />
      <text x="0" y={height / 2 + .5} dominantBaseline="central" textAnchor="middle" fill="#152a1e" fontFamily="var(--font-manrope), Arial, sans-serif" fontSize="14" fontWeight="800" letterSpacing=".4">{dart.hit.label}</text>
    </motion.g>
  </g>;
}

export function Dartboard({ darts, pendingId, onLand, lessMotion, checkoutHit }: { darts: BoardDart[]; pendingId: number | null; onLand: (id: number) => void; lessMotion: boolean; checkoutHit?: DartHit }) {
  const uid = useId().replace(/:/g, "");
  const { center, bull, outerBull, trebleInner, trebleOuter, doubleInner, doubleOuter } = BOARD_GEOMETRY;
  const latestLandedDart = pendingId === null ? darts.at(-1) : undefined;
  return <svg className="dp-dartboard" viewBox="0 0 440 440" role="img" aria-label="Professioneel dartbord met de laatste gegooide pijlen">
    <defs>
      <radialGradient id={`${uid}-surround`}><stop offset="0" stopColor="#26312c" /><stop offset=".87" stopColor="#101713" /><stop offset="1" stopColor="#29362f" /></radialGradient>
      <radialGradient id={`${uid}-face`}><stop offset="0" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#000" stopOpacity=".13" /></radialGradient>
      <linearGradient id={`${uid}-steel`}><stop stopColor="#dddfe3" /><stop offset=".45" stopColor="#69717b" /><stop offset=".6" stopColor="#ecedf0" /><stop offset="1" stopColor="#848b91" /></linearGradient>
      <linearGradient id={`${uid}-flight`} x1="0" x2="1" y1="0" y2=".25"><stop stopColor="#ff8588" /><stop offset=".4" stopColor="#ed424d" /><stop offset="1" stopColor="#8d1425" /></linearGradient>
      <clipPath id={`${uid}-flight-area`}><rect x="0" y="0" width="440" height="440" rx="18" /></clipPath>
      <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".79" numOctaves="3" seed="11" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncA type="linear" slope=".15" /></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light" /></filter>
      <clipPath id={`${uid}-clip`}><circle cx="220" cy="220" r="169.5" /></clipPath>
    </defs>
    <circle cx="220" cy="220" r="217" fill="#060d09" opacity=".35" />
    <circle cx="220" cy="220" r="211" fill={`url(#${uid}-surround)`} stroke="#3c4e42" strokeWidth="1.2" />
    <circle cx="220" cy="220" r="207" fill="none" stroke="#577060" strokeOpacity=".35" />
    <circle cx="220" cy="220" r="177" fill="#090a0a" stroke="#5b5556" strokeWidth=".8" />
    {DART_NUMBERS.map((number, i) => <g key={number}>
      <path d={segment(outerBull, trebleInner, i * 18)} fill={i % 2 === 0 ? "#232626" : "#d2c8af"} />
      <path d={segment(trebleInner, trebleOuter, i * 18)} fill={i % 2 === 0 ? "#b33136" : "#27725d"} />
      <path d={segment(trebleOuter, doubleInner, i * 18)} fill={i % 2 === 0 ? "#232626" : "#d2c8af"} />
      <path d={segment(doubleInner, doubleOuter, i * 18)} fill={i % 2 === 0 ? "#b33136" : "#27725d"} />
    </g>)}
    <circle cx={center} cy={center} r={outerBull} fill="#28765f" /><circle cx={center} cy={center} r={bull} fill="#b33136" />
    <g clipPath={`url(#${uid}-clip)`} opacity=".54"><circle cx="220" cy="220" r="170" fill="transparent" filter={`url(#${uid}-grain)`} /></g>
    <circle cx="220" cy="220" r="170" fill={`url(#${uid}-face)`} />
    <g fill="none" stroke="#b7b6a8" strokeWidth=".7" opacity=".72">
      {[bull, outerBull, trebleInner, trebleOuter, doubleInner, doubleOuter].map(r => <circle key={r} cx={center} cy={center} r={r} />)}
      {DART_NUMBERS.map((_, i) => { const from = point(outerBull, i * 18 - 9), to = point(doubleOuter, i * 18 - 9); return <line key={i} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />; })}
    </g>
    {DART_NUMBERS.map((number, i) => { const [x, y] = point(190, i * 18); return <text key={number} x={x} y={y} dominantBaseline="central" textAnchor="middle" fill="#d9d5d5" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="400">{number}</text>; })}
    {checkoutHit && <g className="dp-winning-double" fill="#baf6bd" fillOpacity=".48" stroke="#e4f7b4" strokeWidth="1.6">{checkoutHit.label === "BULL" ? <circle cx={center} cy={center} r={bull}/> : <path d={segment(doubleInner, doubleOuter, DART_NUMBERS.indexOf(Number(checkoutHit.label.slice(1)) as typeof DART_NUMBERS[number]) * 18)}/>}</g>}
    <g clipPath={`url(#${uid}-flight-area)`} className="dp-dart-flight-layer">
      {darts.map(dart => <DartVisual key={dart.id} dart={dart} flying={pendingId === dart.id} uid={uid} onLand={onLand} lessMotion={lessMotion} />)}
    </g>
    {latestLandedDart && <LandedDartChip key={latestLandedDart.id} dart={latestLandedDart} lessMotion={lessMotion} />}
  </svg>;
}

function CheckoutHint({ game, reducedMotion }: { game: DartsGame; reducedMotion: boolean }) {
  const remaining = game.scores[game.turn];
  const player = game.turn === 0 ? "Nick" : game.opponentName;
  const gameFinished = game.phase === "won";
  // The game only commits these values on impact, so an airborne dart never
  // prematurely changes or removes a finish suggestion.
  const routes = useMemo(() => gameFinished ? [] : getCheckoutRoutes(remaining, game.dartsLeft), [remaining, game.dartsLeft, gameFinished]);
  return <div className="dp-checkout-slot" role="status" aria-live="polite" aria-atomic="true">
    <AnimatePresence mode="wait" initial={false}>
      {routes.length > 0 && <motion.div className="dp-checkout-hint" key={`${game.turn}-${remaining}-${game.dartsLeft}`}
        initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: reducedMotion ? 0 : .18, ease: "easeOut" }}>
        <span className="dp-checkout-label" aria-hidden="true"><i/>Finish</span>
        <span className="sr-only">Uitgooimogelijkheden voor {player}, {remaining} punten met {game.dartsLeft} {game.dartsLeft === 1 ? "pijl" : "pijlen"}: </span>
        <div className="dp-checkout-routes" tabIndex={0} aria-label="Uitgooimogelijkheden, horizontaal scrollbaar">
          {routes.map((route, index) => <span className="dp-checkout-option" key={route.join("-")}>
            {index > 0 && <span className="dp-checkout-divider" aria-hidden="true">|</span>}
            <span>{route.join(" ")}</span>
          </span>)}
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}

export function Scoreboard({ game, lessMotion = false, checkoutHints = true }: { game: DartsGame; lessMotion?: boolean; checkoutHints?: boolean }) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = lessMotion || !!systemReducedMotion;
  return <div className="dp-score-area">
    {checkoutHints && game.rules.doubleOut && game.opened[game.turn] ? <CheckoutHint game={game} reducedMotion={reducedMotion}/> : <div className="dp-checkout-slot"/>}
    <div className="dp-match-score">
    <table className="dp-match-score-table">
      <caption><span title={`${matchRulesLabel(game.rules)} · ${matchFormatLabel(game.rules)}`}>{game.rules.startScore} · {game.rules.doubleIn ? game.rules.doubleOut ? "DIDO" : "DI" : game.rules.doubleOut ? "DO" : "SO"} · <strong>{game.rules.format === "sets" ? `BO${game.rules.bestOfSets} sets / BO${game.rules.bestOf} legs` : `Best of ${game.rules.bestOf} ${game.rules.bestOf === 1 ? "leg" : "legs"}`}</strong></span><span>Game ID: #{game.id}</span></caption>
      <colgroup><col className="dp-match-score-player-col" /><col className="dp-match-score-small-col" /><col className="dp-match-score-small-col" /><col className="dp-match-score-small-col" /><col className="dp-match-score-points-col" /><col className="dp-match-score-visit-col" /></colgroup>
      <thead><tr><th scope="col">Speler</th><th scope="col">Sets</th><th scope="col">Legs</th><th scope="col"><abbr title="Resterende darts in de huidige beurt">D</abbr></th><th scope="col"><abbr title="Resterende punten">Ptn</abbr></th><th scope="col">Beurt</th></tr></thead>
      <tbody>{["Nick", game.opponentName].map((name, i) => {
        const isActive = game.turn === i && game.phase !== "won";
        const isWinner = game.winner === i;
        const visitScore = game.visitScores[i];
        return <tr key={`${i}-${name}`} className={isActive ? "is-active" : isWinner ? "is-winner" : ""}>
          <th scope="row"><div className="dp-match-score-person"><span className="dp-match-score-identity"><PlayerName className="dp-match-score-name" name={name} /><RatingValue player={playerByName(name)} className="dp-match-score-rating" brackets/></span>{game.rules.doubleIn && !game.opened[i] && !isWinner && <abbr className="dp-match-entry" title="Raak een dubbel om deze leg te openen">IN</abbr>}{isWinner ? <span className="dp-match-score-winner">WIN</span> : <span className={`dp-match-score-turn ${isActive ? "is-active" : ""}`} role={isActive ? "img" : undefined} aria-label={isActive ? "Aan de beurt" : undefined} aria-hidden={isActive ? undefined : true} />}</div></th>
          <td>{game.sets[i]}</td><td>{game.legs[i]}</td><td className={isActive ? "dp-match-score-darts-active" : ""}>{isActive ? game.dartsLeft : 0}</td>
          <td><span className="dp-match-score-points"><motion.strong key={game.scores[i]} initial={reducedMotion ? false : { y: 3, opacity: .6 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: .16 }}>{game.scores[i]}</motion.strong></span></td>
          <td><span className={`dp-match-score-visit ${game.visitBusts[i] ? "is-bust" : ""} ${visitScore === null ? "is-empty" : ""}`} aria-label={game.visitBusts[i] ? "Bust: 0 punten in deze beurt" : visitScore === null ? "Nog geen beurt" : `${visitScore} punten in deze beurt`}>{game.visitBusts[i] ? "BUST" : visitScore ?? "—"}</span></td>
        </tr>;
      })}</tbody>
    </table>
    <p className="dp-match-score-announcement" role="status" aria-live="polite" aria-atomic="true">{game.lastResult}</p>
    </div>
  </div>;
}

export function GamePanel({ game, variant, muted = true, interactionBlocked = false, lessMotion = false, showExperience = true, checkoutHints = true }: { game: DartsGame; variant: string; muted?: boolean; interactionBlocked?: boolean; lessMotion?: boolean; showExperience?: boolean; checkoutHints?: boolean }) {
  const { setActive, phase, startOrStop } = game;
  const panel = useRef<HTMLDivElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const previousDarts = useRef(game.dartCount[0] + game.dartCount[1]);
  const xPosition = useTransform(game.xMeter, [0, 1], ["0%", "100%"]);
  const yPosition = useTransform(game.yMeter, [0, 1], ["0%", "100%"]);
  const active = game.phase === "horizontal" || game.phase === "vertical";
  const disabled = game.phase === "opponent" || game.phase === "flight" || interactionBlocked || !game.ready || !!game.offlineUntil || game.sending;

  useEffect(() => {
    setActive(true);
    return () => setActive(false);
  }, [setActive]);

  useEffect(() => () => { void audioContext.current?.close().catch(() => {}); audioContext.current = null; }, []);

  const throwWithGesture = useCallback(() => {
    if (interactionBlocked || !game.ready || game.offlineUntil || game.sending || phase === "flight" || phase === "opponent") return;
    // Audio is created only inside a real button/keyboard gesture, never on load.
    if (!muted) {
      try {
        const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Audio && !audioContext.current) audioContext.current = new Audio();
        if (audioContext.current?.state === "suspended") void audioContext.current.resume().catch(() => {});
      } catch { /* The playable demo still works when audio is unavailable. */ }
    }
    if (phase === "won") game.rematch();
    else startOrStop();
  }, [phase, startOrStop, muted, interactionBlocked, game.ready, game.offlineUntil, game.sending, game.rematch]);

  useEffect(() => {
    const dartCount = game.dartCount[0] + game.dartCount[1];
    const isNewDart = dartCount > previousDarts.current;
    previousDarts.current = dartCount;
    const context = audioContext.current;
    if (!isNewDart || muted || !context || context.state !== "running") return;
    const now = context.currentTime;
    const bust = game.resultTone === "bust";
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(bust ? .038 : .065, now + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + (bust ? .19 : .085));
    envelope.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(bust ? 175 : 250, now);
    oscillator.frequency.exponentialRampToValueAtTime(bust ? 78 : 95, now + (bust ? .17 : .07));
    oscillator.connect(envelope);
    oscillator.start(now);
    oscillator.stop(now + .21);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    if (game.celebration) {
      const notes = game.celebration === "180" ? [523.25, 659.25, 783.99] : [659.25, 880];
      notes.forEach((frequency, index) => {
        const start = now + .09 + index * .085;
        const chime = context.createOscillator(); const gain = context.createGain();
        chime.type = "sine"; chime.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.027, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + .28);
        chime.connect(gain); gain.connect(context.destination); chime.start(start); chime.stop(start + .3);
        chime.onended = () => { chime.disconnect(); gain.disconnect(); };
      });
    }
    if (!bust) {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .04), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const noise = context.createBufferSource(); noise.buffer = buffer;
      const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1700;
      const volume = context.createGain(); volume.gain.value = .048;
      noise.connect(filter); filter.connect(volume); volume.connect(context.destination);
      noise.start(now); noise.onended = () => { noise.disconnect(); filter.disconnect(); volume.disconnect(); };
    }
  }, [game.dartCount, game.resultTone, game.celebration, muted]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (interactionBlocked) return;
      if (event.code !== "Space" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [contenteditable=true], [role=textbox], [role=menuitem], [role=menu], [role=tab]")) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return;
      const bounds = panel.current?.getBoundingClientRect();
      if (!bounds || bounds.bottom < 50 || bounds.top > window.innerHeight - 50 || bounds.width === 0) return;
      event.preventDefault();
      throwWithGesture();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [throwWithGesture, interactionBlocked]);

  return <div ref={panel} className={`dp-game-panel dp-game-${variant} ${game.preferences.leftHanded ? "dp-left-handed" : ""}`}>
    <div className="dp-board-stage">
      <div className="dp-board-and-height">
        <div className="dp-aim-header">
          <div className={`dp-direction-meter ${game.phase === "horizontal" ? "is-running" : ""}`} aria-label="Horizontale timingbalk rechtsboven het dartbord">
            <div className={`dp-meter-row ${game.phase === "horizontal" ? "is-running" : ""}`}><span className="dp-meter-icon"><ArrowRight size={13} aria-hidden="true" /></span><div className="dp-meter-track"><motion.span className="dp-meter-indicator" style={{ left: xPosition }} /></div></div>
          </div>
        </div>
        <div className="dp-oche-playfield">
          <Dartboard key={game.id} darts={game.pendingDart ? [...(game.freshVisit ? [] : game.landedDarts), game.pendingDart] : game.landedDarts} pendingId={game.pendingDart?.id ?? null} onLand={game.landDart} lessMotion={lessMotion} checkoutHit={game.celebration === "checkout" && game.events.at(-1)?.hit.double ? game.events.at(-1)?.hit : undefined} />
          <div className={`dp-height-meter ${game.phase === "vertical" ? "is-running" : ""}`} aria-label="Verticale timingbalk voor de hoogte van je worp">
            <ArrowUp size={12} aria-hidden="true" />
            <div className="dp-meter-track dp-meter-track-vertical"><motion.span className="dp-meter-indicator" style={{ top: yPosition }} /></div>
            <ArrowDown size={12} aria-hidden="true" />
          </div>
        </div>
      </div>
      <button className={`dp-throw-button ${active ? "is-timing" : ""}`} onClick={throwWithGesture} disabled={disabled} aria-label={game.phase === "won" ? "Speel opnieuw" : game.phase === "horizontal" ? "Stop horizontale indicator" : game.phase === "vertical" ? "Stop verticale indicator en gooi" : game.phase === "flight" ? "Pijl onderweg" : "Tegenstander aan de beurt"}>{game.phase === "won" ? <RotateCcw size={22} /> : <><span>{game.phase === "horizontal" ? "STOP" : "GOOI"}</span><ArrowUpRight size={15} /></>}</button>
    </div>
    <Scoreboard game={game} lessMotion={lessMotion} checkoutHints={checkoutHints} />
    {showExperience && <MatchExperience game={game} lessMotion={lessMotion} hidden={interactionBlocked}/>}
  </div>;
}
