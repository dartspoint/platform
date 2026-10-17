"use client";
import {browserLocale} from '../../../../packages/i18n/src/errors';
import {formatLocales} from '../../../../packages/i18n/src/locale';

import {runtimeFeedback} from "../../../../packages/i18n/src/feedback";
import {localiseStaticCopy} from "../../../../packages/i18n/src/static-copy";
import {useI18n} from '@/lib/i18n/provider';

import {RoomMetadataEditor} from "../room-metadata";
import {selfName,usePlatform} from "@/lib/platform-client";
import {publicGameLabel} from '@/lib/public-game-label';

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, Clock3, Crown, DoorOpen, Flag, LockKeyhole, Plus, Search, Shield, ShieldCheck, SlidersHorizontal, Trash2, UserRound, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRatingProfile } from "@/lib/darts-ratings";
import { useDartsSocial } from "@/lib/darts-social";
import { applyAdminMemberAction, closeAdminRoom, deleteAdminRoom, memberStatus, revokeAdminMemberAction, saveAdminRoom, syncAdminReports, updateAdminCase, updateAdminMemberRole, useAdminOperations, type AdminCase, type AdminMember, type AdminResult, type AdminRoom, type AdminSanction } from "@/lib/darts-admin-operations";
import "./darts-operations.css";

const roleLabel = { owner: "Eigenaar", admin: "Admin", vip: "VIP", player: "Speler" };
const roleLabelStaticSource = roleLabel;
const statusLabel = { active: "Actief", muted: "Chat beperkt", suspended: "Geschorst" };
const statusLabelStaticSource = statusLabel;
const categoryLabel = { social: "Sociaal", ranked: "Ranked", beginners: "Beginners", tournament: "Toernooi" };
const categoryLabelStaticSource = categoryLabel;
const accessLabel = { active: "Open", closed: "Gesloten", private: "Op uitnodiging" };
const accessLabelStaticSource = accessLabel;
const caseLabel = { open: "Nieuw", review: "In behandeling", resolved: "Afgesloten" };
const caseLabelStaticSource = caseLabel;
const actionLabel = { warn: "Waarschuwing", mute: "Chat beperken", suspend: "Tijdelijk schorsen" };
const actionLabelStaticSource = actionLabel;
function dateTime(at: number) { return new Date(at).toLocaleString(formatLocales[browserLocale()], { dateStyle: "short", timeStyle: "short" }); }
function resultText(result: AdminResult, success: string) { return result.ok ? success : result.error; }
function useNow() { const [now, setNow] = useState(0); useEffect(() => { const first = setTimeout(() => setNow(Date.now()), 0); const timer = setInterval(() => setNow(Date.now()), 30000); return () => { clearTimeout(first); clearInterval(timer); }; }, []); return now || Date.UTC(2026, 9, 11); }

function MemberName({ member }: { member: AdminMember }) { return <span className={`ops-member-name role-${member.role}`}>{member.role === "vip" && <Crown size={13}/>} {member.name}</span>; }
function Message({ text, error = false }: { text: string; error?: boolean }) { return text ? <p className={`ops-feedback${error ? " error" : ""}`} role={error ? "alert" : "status"}>{text}</p> : null; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="ops-empty"><Search size={24}/><p>{children}</p></div>; }

function SanctionForm({ member, caseId, onDone }: { member: AdminMember; caseId?: string; onDone?: () => void }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("operations").t;

 const actionLabel=localiseStaticCopy(actionLabelStaticSource,dpT,dpStaticCopyKeys);



  const [kind, setKind] = useState<AdminSanction["kind"]>("warn");
  const [minutes, setMinutes] = useState(60);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await applyAdminMemberAction({ name: member.name, kind, minutes, reason, caseId });
    setFeedback(resultText(result, caseId ? dpFeedback("feedback.maatregel_vastgelegd_en_melding_afgesloten") : dpFeedback("feedback.maatregel_vastgelegd"))); setFailed(!result.ok);
    if (result.ok) { setReason(""); onDone?.(); }
  }
  if (member.role === "owner") return <div className="ops-info"><ShieldCheck size={17}/><p>{dpT("operations.de_eigenaar_is_beschermd_je_kunt_je_eigen")}</p></div>;
  return <form className="ops-form ops-sanction" onSubmit={submit}>
    <h3><Shield size={17}/> {dpT("operations.maatregel_vastleggen")}</h3>
    <div className="ops-form-grid"><label>{dpT("operations.actie")}<select value={kind} onChange={event => setKind(event.target.value as AdminSanction["kind"])}><option value="warn">{dpT("operations.waarschuwing")}</option><option value="mute">{dpT("operations.chat_beperken")}</option><option value="suspend">{dpT("operations.tijdelijk_schorsen")}</option></select></label>
      {kind !== "warn" && <label>{dpT("operations.duur")}<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={10}>{dpT("operations.10_minuten")}</option><option value={60}>{dpT("operations.1_uur")}</option><option value={1440}>{dpT("operations.24_uur")}</option><option value={10080}>{dpT("operations.7_dagen")}</option><option value={43200}>{dpT("operations.30_dagen")}</option></select></label>}</div>
    <label>{dpT("operations.reden")}<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder={dpT("operations.leg_concreet_vast_waarom_deze_actie_nodig_is")} minLength={5} maxLength={600} rows={3} required/></label>
    <p className="ops-hint">{dpT("operations.de_maatregel_wordt_direct_toegepast_en_vastgelegd_in")}</p>
    <button type="submit" className={kind === "suspend" ? "ops-button danger" : "ops-button primary"}><Shield size={15}/>{actionLabel[kind]}</button>
    <Message text={feedback} error={failed}/>
  </form>;
}

function MemberDetail({ member }: { member: AdminMember }) {
 const {formatLocale:dpFormatLocale}=useI18n();

 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("operations").t;

 const actionLabel=localiseStaticCopy(actionLabelStaticSource,dpT,dpStaticCopyKeys);

 const statusLabel=localiseStaticCopy(statusLabelStaticSource,dpT,dpStaticCopyKeys);



  const profile = useRatingProfile(member.name);
  const [role, setRole] = useState(member.role);
  const [feedback, setFeedback] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const now = useNow();
  return <div className="ops-member-detail">
    <div className="ops-detail-person"><div className={`ops-avatar role-${member.role}`}>{member.initials}</div><div><MemberName member={member}/><span>{member.country} {dpT("operations.lid_sinds")} {new Date(member.joinedAt).toLocaleDateString(dpFormatLocale)}</span></div><span className={`ops-pill ${memberStatus(member, now)}`}>{statusLabel[memberStatus(member, now)]}</span></div>
    <div className="ops-metrics"><div><span>{dpT("operations.dp")}</span><strong>{Math.round(profile.rating)}</strong><small>{profile.provisional ? dpT("operations.plaatsingsfase") : dpT("operations.geplaatst")}</small></div><div><span>{dpT("operations.partijen")}</span><strong>{member.played}</strong><small>{member.wins} {dpT("operations.gewonnen")}</small></div><div><span>{dpT("operations.gemiddelde")}</span><strong>{new Intl.NumberFormat(dpFormatLocale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(member.average)}</strong><small>{member.oneEighties} × 180</small></div></div>
    <form className="ops-inline-form" onSubmit={async event => { event.preventDefault(); const result = await updateAdminMemberRole(member.name, role); setFeedback(resultText(result, dpFeedback("feedback.rol_opgeslagen"))); }}>
      <label>{dpT("operations.platformrol")}<select value={member.role === "owner" ? "owner" : role} onChange={event => setRole(event.target.value as AdminMember["role"])} disabled={member.role === "owner"}>{member.role === "owner" ? <option value="owner">{dpT("operations.eigenaar_beschermd")}</option> : <><option value="player">{dpT("operations.speler")}</option><option value="vip">{dpT("operations.vip")}</option><option value="admin">{dpT("operations.admin")}</option></>}</select></label>
      <button type="submit" className="ops-button" disabled={member.role === "owner" || role === member.role}><Check size={15}/>{dpT("operations.rol_opslaan")}</button>
    </form><Message text={feedback}/>
    <SanctionForm member={member}/>
    <section className="ops-history"><h3>{dpT("operations.moderatiegeschiedenis")} <span>{member.sanctions.length}</span></h3>{member.sanctions.length === 0 ? <p className="ops-hint">{dpT("operations.er_zijn_geen_maatregelen_voor_deze_speler_vastgelegd")}</p> : [...member.sanctions].reverse().map(entry => <article key={entry.id}><div><strong>{actionLabel[entry.kind]}</strong><span>{entry.revokedAt ? dpT("operations.ingetrokken") : entry.kind === "warn" ? dpT("operations.vastgelegd") : entry.until > now ? dpT("operations.tot",{value0:dateTime(entry.until)}) : dpT("operations.verlopen")}</span></div><p>{entry.reason}</p><small>{dateTime(entry.at)} · {selfName()}</small>{!entry.revokedAt && entry.kind !== "warn" && entry.until > now && <button type="button" className="ops-text-button" onClick={() => { setRevokeId(entry.id); setRevokeReason(""); }}>{dpT("operations.maatregel_intrekken")}</button>}{revokeId === entry.id && <form className="ops-revoke" onSubmit={async event => { event.preventDefault(); const result = await revokeAdminMemberAction(member.name, entry.id, revokeReason); setFeedback(resultText(result, dpFeedback("feedback.maatregel_ingetrokken"))); if (result.ok) setRevokeId(""); }}><label>{dpT("operations.reden_voor_intrekken")}<input value={revokeReason} onChange={event => setRevokeReason(event.target.value)} minLength={5} required maxLength={600}/></label><button className="ops-button" type="submit">{dpT("operations.intrekken")}</button><button className="ops-text-button" type="button" onClick={() => setRevokeId("")}>{dpT("operations.annuleren")}</button></form>}</article>)}</section>
  </div>;
}

export function AdminPlayers() {
 const dpT = useI18n("operations").t;

 const statusLabel=localiseStaticCopy(statusLabelStaticSource,dpT,dpStaticCopyKeys);

 const roleLabel=localiseStaticCopy(roleLabelStaticSource,dpT,dpStaticCopyKeys);



  const { members } = useAdminOperations();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState("");
  const now = useNow();
  const filtered = members.filter(member => member.name.toLowerCase().includes(query.toLowerCase()) && (role === "all" || member.role === role) && (status === "all" || memberStatus(member, now) === status));
  const member = members.find(item => item.name === selected);
  return <div className="ops-module">
    <div className="ops-toolbar"><label className="ops-search"><Search size={16}/><input aria-label={dpT("operations.zoek_speler")} value={query} onChange={event => setQuery(event.target.value)} placeholder={dpT("operations.zoek_een_speler")}/></label><select aria-label={dpT("operations.filter_op_rol")} value={role} onChange={event => setRole(event.target.value)}><option value="all">{dpT("operations.alle_rollen")}</option><option value="owner">{dpT("operations.eigenaar")}</option><option value="admin">{dpT("operations.admin")}</option><option value="vip">{dpT("operations.vip")}</option><option value="player">{dpT("operations.speler")}</option></select><select aria-label={dpT("operations.filter_op_status")} value={status} onChange={event => setStatus(event.target.value)}><option value="all">{dpT("operations.alle_statussen")}</option><option value="active">{dpT("operations.actief")}</option><option value="muted">{dpT("operations.chat_beperkt")}</option><option value="suspended">{dpT("operations.geschorst")}</option></select><span className="ops-count"><Users size={16}/>{members.length} {dpT("operations.spelers")}</span></div>
    <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>{dpT("operations.speler")}</th><th>{dpT("operations.rol")}</th><th>{dpT("operations.dp")}</th><th>{dpT("operations.partijen")}</th><th>{dpT("operations.status")}</th><th><span className="sr-only">{dpT("operations.open_speler")}</span></th></tr></thead><tbody>{filtered.map(item => <tr key={item.name}><td><button className="ops-player-link" onClick={() => setSelected(item.name)}><span className={`ops-avatar role-${item.role}`}>{item.initials}</span><span><MemberName member={item}/><small>{item.country}</small></span></button></td><td><span className={`ops-role role-${item.role}`}>{roleLabel[item.role]}</span></td><td><PlayerRating name={item.name}/></td><td>{item.played}</td><td><span className={`ops-pill ${memberStatus(item, now)}`}>{statusLabel[memberStatus(item, now)]}</span></td><td><button className="ops-icon-button" aria-label={dpT("operations.beheer",{name:item.name})} onClick={() => setSelected(item.name)}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>
    {!filtered.length && <Empty>{dpT("operations.geen_spelers_gevonden_pas_je_filters_aan")}</Empty>}<p className="ops-table-note">{filtered.length} {dpT("operations.van")} {members.length} {dpT("operations.spelers")}</p>
    <Dialog open={Boolean(member)} onOpenChange={open => { if (!open) setSelected(""); }}><DialogContent className="ops-dialog"><DialogTitle>{dpT("operations.spelerdossier")}</DialogTitle><DialogDescription>{dpT("operations.profiel_rol_en_moderatie")}</DialogDescription>{member && <MemberDetail member={member} key={member.name}/>}</DialogContent></Dialog>
  </div>;
}

function PlayerRating({ name }: { name: string }) { const profile = useRatingProfile(name); const displayed = Math.round(profile.rating); return <span className={`ops-rating ${profile.provisional ? "white" : displayed >= 1550 ? "green" : displayed < 1450 ? "red" : "amber"}`}>{displayed}</span>; }

function RoomForm({ room, onClose }: { room?: AdminRoom; onClose: (message?: string) => void }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("operations").t;

 const accessLabel=localiseStaticCopy(accessLabelStaticSource,dpT,dpStaticCopyKeys);

 const categoryLabel=localiseStaticCopy(categoryLabelStaticSource,dpT,dpStaticCopyKeys);



  const { members } = useAdminOperations();
  const [form, setForm] = useState({ region:room?.region??null,primaryLanguage:room?.primaryLanguage??null,name: room?.name ?? "", subtitle: room?.subtitle ?? "", category: room?.category ?? "social", status: room?.status ?? "active", capacity: room?.capacity ?? 50, rules: room?.rules ?? "Respecteer elkaar. Geen spam of beledigingen. Speel eerlijk en maak je wedstrijd af.", minRating: room?.minRating ?? 0, maxRating: room?.maxRating ?? 4000, moderatorIds: room?.moderatorIds ?? [] });
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const result = await saveAdminRoom({ ...form, moderator: "", id: room?.id }); if (result.ok) onClose(room ? dpFeedback("feedback.kamer_bijgewerkt") : dpFeedback("feedback.kamer_aangemaakt")); else setError(result.error); }
  async function remove() { const result = await deleteAdminRoom(room!.id); if (result.ok) onClose(dpT("operations.lege_kamer_verwijderd")); else setError(result.error); }
  return <form className="ops-form" onSubmit={submit}>
    <div className="ops-form-grid"><label>{dpT("operations.kamernaam")}<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required minLength={3} maxLength={40} placeholder={dpT("operations.bijv_haagse_darters")}/></label><label>{dpT("operations.korte_omschrijving")}<input value={form.subtitle} onChange={event => setForm({ ...form, subtitle: event.target.value })} maxLength={100} placeholder={dpT("operations.de_vaste_hangout")}/></label></div>
    <div className="ops-form-grid"><label>{dpT("operations.categorie")}<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as AdminRoom["category"] })}>{Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{dpT("operations.toegang")}<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as AdminRoom["status"] })}>{Object.entries(accessLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <div className="ops-form-grid"><label>{dpT("operations.capaciteit")}<input type="number" min={Math.max(2, room?.count ?? 0)} max={50} value={form.capacity} required onChange={event => setForm({ ...form, capacity: Number(event.target.value) })}/><small>{dpT("operations.maximaal_50_nu")} {room?.count ?? 0} {dpT("operations.aanwezig")}</small></label><label>{dpT("operations.kamerbeheerders")}<select multiple value={form.moderatorIds} onChange={event => setForm({ ...form, moderatorIds: Array.from(event.target.selectedOptions, option => option.value) })}>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select><small>{dpT("operations.je_kunt_meerdere_spelers_selecteren_dit_verleent_alleen")}</small></label></div>
    <div className="ops-form-grid"><label>{dpT("operations.dp_vanaf")}<input type="number" min={0} max={4000} value={form.minRating} required onChange={event => setForm({ ...form, minRating: Number(event.target.value) })}/></label><label>{dpT("operations.dp_tot_en_met")}<input type="number" min={form.minRating} max={4000} value={form.maxRating} required onChange={event => setForm({ ...form, maxRating: Number(event.target.value) })}/></label></div>
    <RoomMetadataEditor value={form} onChange={patch=>setForm({...form,...patch})}/>
    <label>{dpT("operations.kamerregels")}<textarea rows={4} value={form.rules} onChange={event => setForm({ ...form, rules: event.target.value })} maxLength={1500}/></label>
    <div className="ops-info"><DoorOpen size={17}/><p>{form.status === "closed" ? dpT("operations.gesloten_betekent_geen_nieuwe_instroom_huidige_spelers_en") : form.status === "private" ? dpT("operations.deze_kamer_is_alleen_toegankelijk_voor_de_eigenaar") : dpT("operations.open_kamers_zijn_zichtbaar_in_de_lobby_de")}</p></div>
    <Message text={error} error/>
    <div className="ops-actions"><button className="ops-button primary" type="submit"><Check size={16}/>{room ? dpT("operations.wijzigingen_opslaan") : dpT("operations.kamer_aanmaken")}</button><button type="button" className="ops-button" onClick={() => onClose()}>{dpT("operations.annuleren")}</button></div>
    {room && <div className="ops-delete-area">{room.count > 0 || room.matches > 0 ? <p className="ops-hint">{dpT("operations.deze_kamer_is_in_gebruik_en_kan_niet")}</p> : room.status !== "closed" ? <p className="ops-hint">{dpT("operations.sluit_eerst_de_kamer_om_deze_te_kunnen")}</p> : confirmDelete ? <div className="ops-delete-confirm"><span>{dpT("operations.deze_lege_kamer_archiveren")}</span><button type="button" className="ops-button danger" onClick={remove}>{dpT("operations.ja_verwijderen")}</button><button type="button" className="ops-text-button" onClick={() => setConfirmDelete(false)}>{dpT("operations.behouden")}</button></div> : <button type="button" className="ops-text-button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14}/>{dpT("operations.lege_kamer_verwijderen")}</button>}</div>}
  </form>;
}

export function AdminRooms() {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("operations").t;

 const accessLabel=localiseStaticCopy(accessLabelStaticSource,dpT,dpStaticCopyKeys);

 const categoryLabel=localiseStaticCopy(categoryLabelStaticSource,dpT,dpStaticCopyKeys);



  const { rooms } = useAdminOperations();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const visible = rooms.filter(room => `${room.name} ${room.subtitle}`.toLowerCase().includes(query.toLowerCase()) && (category === "all" || room.category === category));
  const editing = rooms.find(room => room.id === editId);
  return <div className="ops-module">
    <div className="ops-toolbar"><label className="ops-search"><Search size={16}/><input aria-label={dpT("operations.zoek_kamer")} value={query} onChange={event => setQuery(event.target.value)} placeholder={dpT("operations.zoek_een_kamer")}/></label><select aria-label={dpT("operations.filter_kamercategorie")} value={category} onChange={event => setCategory(event.target.value)}><option value="all">{dpT("operations.alle_categorieen")}</option>{Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="ops-count">{rooms.length} {dpT("operations.kamers")} {rooms.filter(room => room.status === "active").length} {dpT("operations.open")}</span><button className="ops-button primary" onClick={() => setEditId("new")}><Plus size={16}/>{dpT("operations.nieuwe_kamer")}</button></div>
    <Message text={feedback}/><div className="ops-room-grid">{visible.map(room => <article className={`ops-room-card ${room.status}`} key={room.id}><div className="ops-room-top"><span className="ops-room-icon">{room.status === "private" ? <LockKeyhole size={20}/> : <DoorOpen size={20}/>}</span><span className={`ops-pill ${room.status}`}>{accessLabel[room.status]}</span></div><div className="ops-room-heading"><h3>{room.name}</h3><p>{room.subtitle || dpT("operations.jouw_plek_aan_de_oche")}</p></div><div className="ops-room-population"><span><Users size={14}/>{room.count}<small> / {room.capacity} {dpT("operations.spelers")}</small></span><span>{room.matches} {dpT("operations.partijen_2")}</span></div><div className="ops-capacity" aria-label={dpT("operations.van_plaatsen_bezet",{count:room.count,capacity:room.capacity})}><i style={{ width: `${Math.min(100, room.count / room.capacity * 100)}%` }}/></div><div className="ops-room-meta"><span>{categoryLabel[room.category]}</span><span>{dpT("operations.dp")} {room.minRating}–{room.maxRating}</span><span><Shield size={12}/>{room.moderator}</span></div><div className="ops-room-actions"><button className="ops-button" onClick={() => setEditId(room.id)}><SlidersHorizontal size={14}/>{dpT("operations.bewerken")}</button>{room.status !== "closed" && <button className="ops-text-button" onClick={async () => setFeedback(resultText(await closeAdminRoom(room.id), dpFeedback("feedback.value0_is_gesloten_voor_nieuwe_instroom",{value0:room.name})))}>{dpT("operations.instroom_sluiten")}</button>}</div></article>)}</div>
    {!visible.length && <Empty>{dpT("operations.geen_kamers_gevonden")}</Empty>}
    <Dialog open={editId !== null} onOpenChange={open => { if (!open) setEditId(null); }}><DialogContent className="ops-dialog"><DialogTitle>{editing ? editing.name : dpT("operations.nieuwe_kamer")}</DialogTitle><DialogDescription>{dpT("operations.toegang_capaciteit_en_kamerregels")}</DialogDescription>{editId !== null && <RoomForm room={editing} key={editId} onClose={message => { if (message) setFeedback(message); setEditId(null); }}/>}</DialogContent></Dialog>
  </div>;
}

function CaseDetail({ item }: { item: AdminCase }) {
 const dpFeedback=useI18n("feedback").t;

 const dpT = useI18n("operations").t;

 const caseLabel=localiseStaticCopy(caseLabelStaticSource,dpT,dpStaticCopyKeys);



  const platform=usePlatform();
  const { members } = useAdminOperations();
  const [response, setResponse] = useState(item.response);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  const member = members.find(player => player.name === item.player);
  async function update(status: AdminCase["status"]) { const result = await updateAdminCase(item.id, status, response); setFeedback(resultText(result, status === "resolved" ? dpFeedback("feedback.melding_afgesloten_en_beslissing_vastgelegd") : dpFeedback("feedback.behandelstatus_bijgewerkt"))); setError(!result.ok); }
  return <section className="ops-case-detail">
    <div className="ops-case-detail-top"><span className={`ops-pill case-${item.status}`}>{caseLabel[item.status]}</span><span>{item.id}</span></div><h3>{item.reason}</h3><div className="ops-case-subject"><div className="ops-avatar"><UserRound size={20}/></div><span><strong>{item.player}</strong><small>{dpT("operations.gemeld_door")} {item.reporter} · {dateTime(item.at)}</small></span></div>
    <dl className="ops-context-grid"><div><dt>{dpT("operations.kamer")}</dt><dd>{item.room || dpT("operations.niet_opgegeven")}</dd></div><div><dt>{dpT("operations.game_id")}</dt><dd>{item.gameId ? publicGameLabel(platform,item.gameId) : dpT("operations.geen_wedstrijd")}</dd></div><div><dt>{dpT("operations.bron")}</dt><dd>{item.source === "demo" ? dpT("operations.fictief_voorbeeld") : dpT("operations.spelermelding")}</dd></div></dl>
    <div className="ops-evidence"><h4>{dpT("operations.context_bewijs")}</h4><p>{item.context || dpT("operations.de_melder_heeft_geen_aanvullende_context_meegestuurd")}</p></div>
    {item.response && <div className="ops-decision"><Check size={16}/><p>{item.response}</p></div>}
    <form className="ops-form" onSubmit={event => { event.preventDefault(); update("resolved"); }}><label>{dpT("operations.behandelnotitie")}<textarea value={response} onChange={event => setResponse(event.target.value)} rows={3} maxLength={1200} placeholder={dpT("operations.beschrijf_je_bevinding_en_de_gekozen_vervolgstap")}/></label><div className="ops-actions">{item.status === "open" && <button type="button" className="ops-button" onClick={() => update("review")}><Clock3 size={15}/>{dpT("operations.in_behandeling")}</button>}{item.status !== "resolved" ? <button type="submit" className="ops-button primary"><Check size={15}/>{dpT("operations.afsluiten_zonder_maatregel")}</button> : <button type="button" className="ops-button" onClick={() => update("review")}>{dpT("operations.melding_heropenen")}</button>}</div><Message text={feedback} error={error}/></form>
    {item.status !== "resolved" && (member ? <SanctionForm member={member} caseId={item.id}/> : <p className="ops-hint">{dpT("operations.deze_naam_staat_niet_in_de_lokale_spelerslijst")}</p>)}
  </section>;
}

export function AdminModeration() {
 const dpT = useI18n("operations").t;

 const caseLabel=localiseStaticCopy(caseLabelStaticSource,dpT,dpStaticCopyKeys);



  const platform=usePlatform();
  const { cases } = useAdminOperations();
  const social = useDartsSocial();
  useEffect(() => syncAdminReports(social.reports), [social.reports]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AdminCase["status"]>("all");
  const [selected, setSelected] = useState("");
  const filtered = [...cases].reverse().filter(item => (status === "all" || item.status === status) && `${item.player} ${item.id} ${item.reason} ${item.gameId}`.toLowerCase().includes(query.toLowerCase()));
  const selectedCase = filtered.find(item => item.id === selected) ?? filtered[0];
  return <div className="ops-module">
    <div className="ops-toolbar"><label className="ops-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={dpT("operations.speler_melding_of_game_id")} aria-label={dpT("operations.zoek_melding")}/></label><select aria-label={dpT("operations.filter_meldingstatus")} value={status} onChange={event => { setStatus(event.target.value as typeof status); setSelected(""); }}><option value="all">{dpT("operations.alle_meldingen")}</option><option value="open">{dpT("operations.nieuw")}</option><option value="review">{dpT("operations.in_behandeling")}</option><option value="resolved">{dpT("operations.afgesloten")}</option></select><span className="ops-count"><Flag size={16}/>{cases.filter(item => item.status !== "resolved").length} {dpT("operations.open")}</span></div>
    <div className="ops-moderation-layout"><div className="ops-case-list">{filtered.map(item => <button key={item.id} className={selectedCase?.id === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}><span className="ops-case-list-head"><span className={`ops-pill case-${item.status}`}>{caseLabel[item.status]}</span><small>{item.source === "demo" ? dpT("operations.voorbeeld") : dpT("operations.melding")}</small></span><strong>{item.reason}</strong><span>{item.player} · {item.room}</span><small>{item.id} {item.gameId ? dpT("operations.label",{value0:publicGameLabel(platform,item.gameId)}) : ""}</small><ChevronRight size={16}/></button>)}{!filtered.length && <Empty>{dpT("operations.geen_meldingen_bij_dit_filter")}</Empty>}</div>{selectedCase ? <CaseDetail item={selectedCase} key={selectedCase.id}/> : <div className="ops-case-detail ops-empty"><ShieldCheck size={30}/><h3>{dpT("operations.alles_bijgewerkt")}</h3><p>{dpT("operations.nieuwe_meldingen_vanuit_het_spel_verschijnen_hier")}</p></div>}</div>
  </div>;
}

const dpStaticCopyKeys={
  "Eigenaar": "operations.copy_eigenaar",
  "Speler": "operations.copy_speler",
  "Actief": "operations.copy_actief",
  "Chat beperkt": "operations.copy_chat_beperkt",
  "Geschorst": "operations.copy_geschorst",
  "Sociaal": "operations.copy_sociaal",
  "Toernooi": "operations.copy_toernooi",
  "Gesloten": "operations.copy_gesloten",
  "Op uitnodiging": "operations.copy_op_uitnodiging",
  "Nieuw": "operations.copy_nieuw",
  "In behandeling": "operations.copy_in_behandeling",
  "Afgesloten": "operations.copy_afgesloten",
  "Waarschuwing": "operations.copy_waarschuwing",
  "Chat beperken": "operations.copy_chat_beperken",
  "Tijdelijk schorsen": "operations.copy_tijdelijk_schorsen"
};
