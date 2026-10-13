"use client";
/* Native links preserve the prototype's reliable full-page mobile navigation. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, BookOpen, Check, CheckCircle2, ChevronRight, Crosshair, Flame, LockKeyhole, RotateCcw, Sparkles, Target } from "lucide-react";
import { BOARD_GEOMETRY, DART_NUMBERS, applyDart, dartPoseAt, dartTipPosition, dartTransform, scoreDart, type DartHit } from "@/lib/darts-rules";
import { getCheckoutRoutes } from "@/lib/darts-checkouts";
import { completePracticeTutorial, currentPracticeProgress, PRACTICE_CHANGED_EVENT, PRACTICE_STORAGE_KEY, practiceBadges, practiceChallenge, recordPracticeHit, refreshPracticeProgress, serverPracticeProgress } from "@/lib/darts-practice";
import "./darts-practice.css";

function subscribePractice(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === PRACTICE_STORAGE_KEY) { refreshPracticeProgress(); listener(); } };
  window.addEventListener(PRACTICE_CHANGED_EVENT, listener); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(PRACTICE_CHANGED_EVENT, listener); window.removeEventListener("storage", storage); };
}
const subscribeHydration = () => () => {};
const hydrated = () => true;
const unhydrated = () => false;
const emptyQuery = () => "";
const browserQuery = () => window.location.search;
function subscribeQuery(listener: () => void) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }

export function usePracticeProgress() {
  const progress = useSyncExternalStore(subscribePractice, currentPracticeProgress, serverPracticeProgress);
  const ready = useSyncExternalStore(subscribeHydration, hydrated, unhydrated);
  const [challenge, setChallenge] = useState(() => practiceChallenge());
  useEffect(() => {
    const refresh = () => setChallenge(practiceChallenge());
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  return { progress, challenge, badges: practiceBadges(progress), ready };
}

export function WeeklyChallengeCard({ onStart }: { onStart?: () => void }) {
  const { progress, challenge } = usePracticeProgress();
  const hit = progress.weeks[challenge.id] ?? [];
  const count = challenge.targets.filter(target => hit.includes(target)).length;
  return <section className="practice-week-card">
    <div className="practice-card-eyebrow"><Flame size={16}/><span>DEZE WEEK · WEEK {challenge.number}</span><b>{count}/5</b></div>
    <h3>Vijf dubbels. Jouw ritme.</h3><p>Raak deze vijf dubbels op het oefenbord. Iedere echte treffer telt mee.</p>
    <div className="practice-week-targets">{challenge.targets.map(target => <span className={hit.includes(target) ? "is-hit" : ""} key={target}>{hit.includes(target) && <Check size={13}/>} {target}</span>)}</div>
    <div className="practice-progress-line" role="progressbar" aria-label="Weekuitdaging" aria-valuenow={count} aria-valuemin={0} aria-valuemax={5}><i style={{ width: `${count * 20}%` }}/></div>
    {onStart ? <button className="practice-text-link" onClick={onStart}>{count === 5 ? "Uitdaging voltooid · blijf oefenen" : "Ga naar het oefenbord"}<ArrowRight size={15}/></button> : <a className="practice-text-link" href="/oefenen?uitdaging=1">{count === 5 ? "Uitdaging voltooid · blijf oefenen" : "Ga naar het oefenbord"}<ArrowRight size={15}/></a>}
  </section>;
}

export function PracticeAchievements() {
  const { badges, progress } = usePracticeProgress();
  return <section className="practice-achievements">
    <div className="practice-section-title"><div><span className="practice-eyebrow">JOUW VERZAMELING</span><h3>Verdiend op het bord.</h3></div><span>{badges.filter(badge => badge.unlocked).length}/{badges.length}</span></div>
    <p className="practice-muted">Badges veranderen je rating niet. Deze oefenprestaties worden op dit apparaat bewaard.</p>
    <div className="practice-badge-grid">{badges.map((badge, index) => { const Icon = [Sparkles, Target, Flame, Crosshair, Award][index]; return <article key={badge.id} className={`practice-badge ${badge.unlocked ? "is-unlocked" : "is-locked"}`}>
      <div className="practice-badge-medal"><Icon size={25}/>{badge.unlocked ? <CheckCircle2 size={13}/> : <LockKeyhole size={12}/>}</div><h4>{badge.title}</h4><p>{badge.description}</p><span>{badge.unlocked ? "VERDIEND" : `${badge.progress} / ${badge.total}`}</span>
    </article>; })}</div>
    <div className="practice-records"><div><strong>{progress.dartsThrown}</strong><span>Oefenpijlen</span></div><div><strong>{progress.highestVisit || "—"}</strong><span>Hoogste beurt</span></div><div><strong>{progress.highestCheckout || "—"}</strong><span>Hoogste finish</span></div><div><strong>{progress.oneEighties}</strong><span>180’s</span></div></div>
  </section>;
}

function point(radius: number, angle: number) { return [220 + Math.sin(angle * Math.PI / 180) * radius, 220 - Math.cos(angle * Math.PI / 180) * radius]; }
function segment(inner: number, outer: number, angle: number) {
  const a = point(outer, angle - 9), b = point(outer, angle + 9), c = point(inner, angle + 9), d = point(inner, angle - 9);
  return `M${a[0]},${a[1]} A${outer},${outer} 0 0 1 ${b[0]},${b[1]} L${c[0]},${c[1]} A${inner},${inner} 0 0 0 ${d[0]},${d[1]} Z`;
}

function PracticeDart({ hit, flying, onLand }: { hit: DartHit; flying: boolean; onLand: () => void }) {
  const reduced = useReducedMotion();
  const visual = useRef<SVGGElement>(null);
  const didLand = useRef(false);
  useEffect(() => {
    const draw = (value: number) => { const pose = dartPoseAt(hit, value); visual.current?.setAttribute("transform", dartTransform(pose)); visual.current?.setAttribute("opacity", String(pose.opacity)); };
    const finish = () => { draw(1); if (!didLand.current && flying) { didLand.current = true; onLand(); } };
    if (!flying || reduced) { finish(); return; }
    const flight = animate(0, 1, { duration: .56, ease: [.2, .68, .35, 1], onUpdate: draw, onComplete: finish });
    return () => flight.stop();
  }, [hit, flying, onLand, reduced]);
  return <g ref={visual} transform={dartTransform(dartPoseAt(hit, flying && !reduced ? 0 : 1))}>
    <path d="M0 0 V13" stroke="#e6ece8" strokeWidth="1.4" strokeLinecap="butt"/>
    <path d="M-2 12 L-3 17 L-2.5 28 L0 31 L2.5 28 L3 17 L2 12 Z" fill="#c1cbc4" stroke="#788b81" strokeWidth=".7"/>
    <path d="M-2.5 18 H2.5 M-2.5 21 H2.5 M-2.5 24 H2.5 M-2 27 H2" stroke="#54645b" strokeWidth=".9"/>
    <path d="M0 30 V45" stroke="#acbcb2" strokeWidth="2"/>
    <path d="M0 36 L-7.5 43 L-8 56 L0 50 L8 56 L7.5 43 Z" fill="#ee454d" stroke="#9c2430" strokeWidth=".7"/>
    <path d="M0 37 V50 L-7.5 54 L-5 43 Z" fill="#ff8284" opacity=".7"/>
    <path d="M0 37 V51" stroke="#ffcac6" strokeWidth=".8"/>
  </g>;
}

function PracticeBoard({ target, dart, flying, chip, onLand }: { target: string | null; dart: { id: number; hit: DartHit } | null; flying: boolean; chip: boolean; onLand: () => void }) {
  const uid = useId().replace(/:/g, "");
  const g = BOARD_GEOMETRY;
  const position = dart ? dartTipPosition(dart.hit) : null;
  return <svg className="practice-board" viewBox="0 0 440 440" role="img" aria-label={`Oefenbord${target ? `, doel ${target}` : ""}`}>
    <defs><radialGradient id={`${uid}-rim`}><stop offset="75%" stopColor="#08150e"/><stop offset="94%" stopColor="#1c3025"/><stop offset="100%" stopColor="#102218"/></radialGradient><filter id={`${uid}-shadow`} x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="13" stdDeviation="11" floodOpacity=".65"/></filter></defs>
    <circle cx="220" cy="220" r="209" fill={`url(#${uid}-rim)`} stroke="#6c8b7550" strokeWidth="2" filter={`url(#${uid}-shadow)`}/>
    <circle cx="220" cy="220" r="177" fill="#07100b" stroke="#99a59840"/>
    {DART_NUMBERS.map((number, index) => { const angle = index * 18; const [tx, ty] = point(191, angle); return <g key={number}>
      <path d={segment(g.outerBull, g.doubleOuter, angle)} fill={index % 2 ? "#d9d0ae" : "#242824"} stroke="#a6af9865" strokeWidth=".55"/>
      <path d={segment(g.trebleInner, g.trebleOuter, angle)} fill={index % 2 ? "#3d8970" : "#b5343d"} stroke="#a6af9880" strokeWidth=".6"/>
      <path d={segment(g.doubleInner, g.doubleOuter, angle)} fill={index % 2 ? "#3d8970" : "#b5343d"} stroke="#a6af9880" strokeWidth=".6"/>
      {target === `D${number}` && <path d={segment(g.doubleInner, g.doubleOuter, angle)} className="practice-target-ring" fill="#f4db6860" stroke="#ffe798" strokeWidth="2"/>}
      <text x={tx} y={ty} fill="#d8e3d9" textAnchor="middle" dominantBaseline="central" fontSize="17" fontFamily="Manrope Variable, sans-serif">{number}</text>
    </g>; })}
    <circle cx="220" cy="220" r={g.outerBull} fill="#3d8970" stroke="#a6af98" strokeWidth=".7"/><circle cx="220" cy="220" r={g.bull} fill="#bb3e43" stroke={target === "BULL" ? "#ffe798" : "#a6af98"} strokeWidth={target === "BULL" ? 2 : .7}/>
    {dart && <PracticeDart key={dart.id} hit={dart.hit} flying={flying} onLand={onLand}/>}
    {chip && dart && position && <g transform={`translate(${Math.max(32, Math.min(408, position.x))} ${Math.max(37, position.y - 21)})`}><rect x="-25" y="-24" width="50" height="29" rx="9" fill="#eee4af" stroke="#fff7d1"/><path d="M-4 5 L0 10 L4 5" fill="#eee4af"/><text y="-9" fill="#183023" fontSize="13" fontWeight="800" textAnchor="middle" dominantBaseline="central">{dart.hit.label}</text></g>}
  </svg>;
}

type PracticeMode = "free" | "doubles" | "bull" | "checkout" | "challenge";
type PracticePhase = "horizontal" | "vertical" | "flying" | "pause" | "done";
const tutorialSteps = [
  { title: "Vind je richting.", text: "De groene indicator beweegt vanzelf. Stop hem op de plek waar je horizontaal wilt mikken. Daarna kies je de hoogte.", hint: "Eerst links–rechts, dan boven–onder." },
  { title: "Jij bepaalt de hoogte.", text: "De verticale balk werkt hetzelfde: bovenin is hoog op het bord, onderin is laag. De pijl vertrekt zodra je de tweede indicator stopt.", hint: "Twee tikken. Eén worp." },
  { title: "Voel het ritme.", text: "Probeer nu het midden te vinden. De kleine rode bull is 50 punten waard; de groene ring eromheen 25.", hint: "Mik voor de BULL op het midden van beide balken." },
  { title: "Ontdek de dubbels.", text: "De buitenste smalle ring verdubbelt de waarde. De binnenste smalle ring is een treble en telt driemaal.", hint: "D20 is 40 punten. T20 is 60 punten." },
  { title: "Nog één pijl. Helemaal van jou.", text: "Je kent de bediening. Pak je eigen ritme en kies een vak. In een 501-wedstrijd eindig je op een dubbel of BULL.", hint: "Je score verandert pas wanneer de punt het bord raakt." },
];

export function DartsPractice({ tutorial = false, onClose }: { tutorial?: boolean; onClose?: () => void }) {
  const { progress, challenge } = usePracticeProgress();
  const query = useSyncExternalStore(subscribeQuery, browserQuery, emptyQuery);
  const queryParams = new URLSearchParams(query);
  const [tutorialOverride, setTutorial] = useState<boolean | null>(null);
  const isTutorial = tutorialOverride ?? (tutorial || queryParams.get("les") === "1");
  const [modeOverride, setMode] = useState<PracticeMode | null>(null);
  const mode = modeOverride ?? (queryParams.get("uitdaging") === "1" ? "challenge" : "free");
  const [chosenDouble, setChosenDouble] = useState(20);
  const [finishInput, setFinishInput] = useState("40");
  const [finish, setFinish] = useState(40);
  const [remaining, setRemaining] = useState(40);
  const [phase, setPhase] = useState<PracticePhase>("horizontal");
  const [dart, setDart] = useState<{ id: number; hit: DartHit } | null>(null);
  const [visit, setVisit] = useState<DartHit[]>([]);
  const [count, setCount] = useState(0);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [targetsHit, setTargetsHit] = useState(0);
  const [message, setMessage] = useState("Stop de richting. Daarna kies je de hoogte.");
  const [attemptEnded, setAttemptEnded] = useState(false);
  const [inputError, setInputError] = useState("");
  const xMeter = useMotionValue(.5), yMeter = useMotionValue(.5);
  const xPosition = useTransform(xMeter, value => `${value * 100}%`), yPosition = useTransform(yMeter, value => `${value * 100}%`);
  const lockedX = useRef(.5), dartId = useRef(0), landedId = useRef(0);
  const challengeHit = progress.weeks[challenge.id] ?? [];
  const target = isTutorial ? (count === 2 ? "BULL" : count === 3 ? "D20" : null) : mode === "bull" ? "BULL" : mode === "doubles" ? `D${chosenDouble}` : mode === "challenge" ? challenge.targets.find(label => !challengeHit.includes(label)) ?? null : null;
  const checkoutRoutes = useMemo(() => mode === "checkout" && !attemptEnded ? getCheckoutRoutes(remaining, 3 - visit.length) : [], [mode, remaining, visit.length, attemptEnded]);

  useEffect(() => {
    if (phase !== "horizontal" && phase !== "vertical") return;
    const meter = phase === "horizontal" ? xMeter : yMeter;
    const duration = phase === "horizontal" ? 2200 : 2500;
    let frame = 0; let started: number | null = null;
    const tick = (now: number) => { if (started === null) started = now; const position = ((now - started) / duration + .25) % 1; meter.set(position < .5 ? position * 2 : 2 - position * 2); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, xMeter, yMeter]);

  const reset = useCallback((nextMode = mode, nextTutorial = isTutorial, nextFinish = finish) => {
    ++dartId.current; setMode(nextMode); setTutorial(nextTutorial); setPhase("horizontal"); setDart(null); setVisit([]); setCount(0); setSessionPoints(0); setTargetsHit(0); setRemaining(nextFinish); setAttemptEnded(false); setInputError(""); xMeter.set(.5); yMeter.set(.5); setMessage("Stop de richting. Daarna kies je de hoogte.");
  }, [mode, isTutorial, finish, xMeter, yMeter, setMode, setTutorial]);

  const act = useCallback(() => {
    if (phase === "horizontal") { lockedX.current = xMeter.get(); setPhase("vertical"); setMessage("Richting vast. Stop nu de hoogte."); }
    else if (phase === "vertical") { const hit = scoreDart((lockedX.current - .5) * 2.28, (yMeter.get() - .5) * 2.28); setDart({ id: ++dartId.current, hit }); setPhase("flying"); setMessage("Daar gaat je pijl…"); }
    else if (phase === "pause") { if (visit.length === 3 || attemptEnded) { setVisit([]); setRemaining(finish); setAttemptEnded(false); } setPhase("horizontal"); setMessage("Nieuwe pijl. Vind je richting."); }
  }, [phase, xMeter, yMeter, visit.length, attemptEnded, finish]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => { const element = event.target as HTMLElement; if (event.code !== "Space" || event.repeat || /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(element.tagName) || element.isContentEditable) return; event.preventDefault(); act(); };
    window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle);
  }, [act]);

  const land = useCallback(() => {
    if (!dart || phase !== "flying" || dart.id === landedId.current) return;
    landedId.current = dart.id;
    const nextVisit = [...visit, dart.hit];
    const total = nextVisit.reduce((sum, hit) => sum + hit.score, 0);
    const result = mode === "checkout" && !isTutorial ? applyDart(remaining, finish, dart.hit) : null;
    const nextCount = count + 1;
    const hitTarget = target === dart.hit.label;
    setVisit(nextVisit); setCount(nextCount); setSessionPoints(value => value + dart.hit.score); if (hitTarget) setTargetsHit(value => value + 1);
    recordPracticeHit(dart.hit, { visitTotal: total, visitComplete: nextVisit.length === 3, checkout: result?.checkout ? finish : undefined });
    if (result) { setRemaining(result.remaining); setAttemptEnded(result.bust || result.checkout || nextVisit.length === 3); }
    setMessage(result?.checkout ? `${finish} uitgegooid! Afgesloten met ${dart.hit.label}.` : result?.bust ? (remaining - dart.hit.score === 1 ? `Bust: 1 over. Terug naar ${finish}.` : remaining - dart.hit.score === 0 ? `Bust: eindig op een dubbel. Terug naar ${finish}.` : `Bust: te veel gegooid. Terug naar ${finish}.`) : hitTarget ? `${dart.hit.label} geraakt. Precies je doel!` : `${dart.hit.label} · ${dart.hit.score} ${dart.hit.score === 1 ? "punt" : "punten"}${mode === "checkout" && nextVisit.length === 3 ? ". Nieuwe poging?" : "."}`);
    if (isTutorial && nextCount === 5) { completePracticeTutorial(); setPhase("done"); } else setPhase("pause");
  }, [dart, phase, visit, mode, isTutorial, remaining, finish, count, target]);

  const updateFinish = () => { const score = Number(finishInput); if (!Number.isInteger(score) || score < 2 || score > 170) { setInputError("Kies een heel getal tussen 2 en 170."); return; } setFinish(score); reset("checkout", false, score); };
  const visitTotal = visit.reduce((sum, hit) => sum + hit.score, 0);
  const tutorialStep = tutorialSteps[Math.min(count, 4)];
  const buttonText = phase === "horizontal" ? "RICHTING" : phase === "vertical" ? "HOOGTE" : phase === "flying" ? "GOOI!" : phase === "done" ? "KLAAR" : attemptEnded ? "OPNIEUW" : "VOLGENDE";

  return <div className="darts-practice">
    <header className="practice-header">{onClose ? <button className="practice-back" onClick={onClose}><ArrowLeft size={18}/><span>Terug</span></button> : <a className="practice-back" href="/lobby"><ArrowLeft size={18}/><span>Lobby</span></a>}<div><Target size={18}/><strong>{isTutorial ? "Je eerste vijf pijlen" : "Het oefenbord"}</strong></div><span className="practice-unranked"><i/>Geen ratingpunten</span></header>
    <main className="practice-layout">
      <section className="practice-play">
        <div className="practice-heading"><div><span className="practice-eyebrow">{isTutorial ? `PIJL ${Math.min(count + 1, 5)} VAN 5` : "RUIMTE OM BETER TE WORDEN"}</span><h1>{isTutorial ? tutorialStep.title : "Vind jouw ritme."}</h1></div><button className="practice-icon-button" aria-label="Oefensessie opnieuw starten" disabled={phase === "flying"} onClick={() => reset()}><RotateCcw size={17}/></button></div>
        {isTutorial ? <div className="practice-tutorial-copy"><p>{tutorialStep.text}</p><div className="practice-tutorial-dots">{tutorialSteps.map((_, index) => <span key={index} className={index < count ? "is-done" : index === count ? "is-current" : ""}>{index < count ? <Check size={12}/> : index + 1}</span>)}<small>{tutorialStep.hint}</small></div></div> : <>
          <div className="practice-mode-tabs" role="group" aria-label="Oefenvorm">{([{ id: "free", label: "Vrij gooien" }, { id: "doubles", label: "Dubbels" }, { id: "bull", label: "Bull" }, { id: "checkout", label: "Finishes" }, { id: "challenge", label: "Weekdoel" }] as const).map(option => <button key={option.id} aria-pressed={mode === option.id} disabled={phase === "flying"} className={mode === option.id ? "is-active" : ""} onClick={() => reset(option.id, false)}>{option.label}</button>)}</div>
          <div className="practice-mode-options">{mode === "doubles" ? <><label htmlFor="practice-double">Jouw dubbel</label><select id="practice-double" value={chosenDouble} disabled={phase === "flying"} onChange={event => { setChosenDouble(Number(event.target.value)); reset(); }}>{Array.from({ length: 20 }, (_, i) => 20 - i).map(number => <option key={number} value={number}>D{number} · {number * 2} punten</option>)}</select></> : mode === "checkout" ? <><label htmlFor="practice-checkout">Uitgooien vanaf</label><input id="practice-checkout" type="number" min={2} max={170} value={finishInput} disabled={phase === "flying"} onChange={event => setFinishInput(event.target.value)}/><button onClick={updateFinish} disabled={phase === "flying"}>Instellen<Check size={14}/></button></> : mode === "challenge" ? <><Flame size={16}/><span>{target ? `Volgende dubbel: ${target}` : "Alle vijf dubbels geraakt. Lekker gegooid!"}</span><b>{challenge.targets.filter(label => challengeHit.includes(label)).length}/5</b></> : mode === "bull" ? <><Crosshair size={16}/><span>De rode BULL telt 50. Groen eromheen is 25.</span></> : <><Target size={16}/><span>Drie pijlen per beurt. Alle ruimte om te oefenen.</span></>}</div>{inputError && <p className="practice-error" role="alert">{inputError}</p>}
        </>}
        <div className="practice-arena">
          <div className={`practice-meter practice-meter-x ${phase === "horizontal" ? "is-running" : ""}`} aria-label="Richtingsbalk"><ArrowRight size={16}/><div><motion.i style={{ left: xPosition }}/></div></div>
          <div className="practice-board-space"><PracticeBoard target={target} dart={dart} flying={phase === "flying"} chip={phase === "pause" || phase === "done"} onLand={land}/></div>
          <div className={`practice-meter practice-meter-y ${phase === "vertical" ? "is-running" : ""}`} aria-label="Hoogtebalk"><span>↑</span><div><motion.i style={{ top: yPosition }}/></div><span>↓</span></div>
          <button className="practice-throw" onClick={act} disabled={phase === "flying" || phase === "done"} aria-label={phase === "horizontal" ? "Stop de richting" : phase === "vertical" ? "Stop de hoogte en gooi" : "Volgende pijl"}><strong>{buttonText}</strong><ArrowUpRight size={22}/></button>
          <AnimatePresence>{phase === "done" && <motion.div className="practice-complete" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} role="status"><span className="practice-complete-medal"><Award size={30}/></span><span className="practice-eyebrow">JE EERSTE BADGE IS BINNEN</span><h2>Jij hebt het ritme.</h2><p>Vijf pijlen. {sessionPoints} punten. Klaar voor je eerste wedstrijd?</p><a href="/lobby">Naar de lobby<ArrowRight size={16}/></a><button onClick={() => reset("free", false)}>Nog even oefenen</button></motion.div>}</AnimatePresence>
        </div>
        <div className="practice-status" role="status" aria-live="polite"><span className={attemptEnded && remaining === 0 ? "is-success" : ""}>{message}</span><small>Spatie werkt ook</small></div>
        <div className="practice-visit"><div className="practice-dart-slots">{[0, 1, 2].map(index => <span key={index} className={visit[index] ? "is-filled" : ""}>{visit[index]?.label ?? "—"}</span>)}</div><div><small>{mode === "checkout" && !isTutorial ? "OVER" : "BEURT"}</small><strong>{mode === "checkout" && !isTutorial ? remaining : visitTotal}</strong></div><span>{count} {count === 1 ? "pijl" : "pijlen"}{target ? ` · doel ${target}` : ""}</span></div>
        {mode === "checkout" && !isTutorial && <div className="practice-checkout-routes"><Target size={14}/>{checkoutRoutes.length ? checkoutRoutes.map((route, index) => <span key={index}>{route.join(" ")}</span>) : <span>{attemptEnded ? "Nieuwe poging begint weer op je gekozen finish." : "Geen finish mogelijk met de resterende pijlen."}</span>}</div>}
      </section>
      <aside className="practice-sidebar"><section className="practice-session-card"><span className="practice-eyebrow">DEZE OEFENSESSIE</span><h3>Elke pijl telt.</h3><div className="practice-session-stats"><div><strong>{count}</strong><span>Pijlen</span></div><div><strong>{sessionPoints}</strong><span>Punten</span></div><div><strong>{count ? (sessionPoints / count * 3).toFixed(1) : "—"}</strong><span>3-pijlsgem.</span></div><div><strong>{targetsHit}</strong><span>Doel geraakt</span></div></div><p>Oefenen heeft geen invloed op Elo. Je eigen records en badges blijven bewaard.</p></section><WeeklyChallengeCard onStart={() => reset("challenge", false)}/>{!isTutorial && <button className="practice-tutorial-link" onClick={() => reset("free", true)}><BookOpen size={19}/><span><strong>Even de bediening leren?</strong><small>Vijf pijlen, helemaal op je eigen tempo.</small></span><ChevronRight size={18}/></button>}</aside>
    </main>
    <div className="practice-achievements-wrap"><PracticeAchievements/></div>
  </div>;
}
