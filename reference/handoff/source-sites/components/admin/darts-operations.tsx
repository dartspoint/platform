"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ChevronRight, Clock3, Crown, DoorOpen, Flag, LockKeyhole, Plus, Search, Shield, ShieldCheck, SlidersHorizontal, Trash2, UserRound, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRatingProfile } from "@/lib/darts-ratings";
import { useDartsSocial } from "@/lib/darts-social";
import { applyAdminMemberAction, closeAdminRoom, deleteAdminRoom, memberStatus, revokeAdminMemberAction, saveAdminRoom, syncAdminReports, updateAdminCase, updateAdminMemberRole, useAdminOperations, type AdminCase, type AdminMember, type AdminResult, type AdminRoom, type AdminSanction } from "@/lib/darts-admin-operations";
import "./darts-operations.css";

const roleLabel = { owner: "Eigenaar", admin: "Admin", vip: "VIP", player: "Speler" };
const statusLabel = { active: "Actief", muted: "Chat beperkt", suspended: "Geschorst" };
const categoryLabel = { social: "Sociaal", ranked: "Ranked", beginners: "Beginners", tournament: "Toernooi" };
const accessLabel = { active: "Open", closed: "Gesloten", private: "Op uitnodiging" };
const caseLabel = { open: "Nieuw", review: "In behandeling", resolved: "Afgesloten" };
const actionLabel = { warn: "Waarschuwing", mute: "Chat beperken", suspend: "Tijdelijk schorsen" };
function dateTime(at: number) { return new Date(at).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }); }
function resultText(result: AdminResult, success: string) { return result.ok ? success : result.error; }
function useNow() { const [now, setNow] = useState(0); useEffect(() => { const first = setTimeout(() => setNow(Date.now()), 0); const timer = setInterval(() => setNow(Date.now()), 30000); return () => { clearTimeout(first); clearInterval(timer); }; }, []); return now || Date.UTC(2026, 9, 11); }

function MemberName({ member }: { member: AdminMember }) { return <span className={`ops-member-name role-${member.role}`}>{member.role === "vip" && <Crown size={13}/>} {member.name}</span>; }
function Message({ text, error = false }: { text: string; error?: boolean }) { return text ? <p className={`ops-feedback${error ? " error" : ""}`} role={error ? "alert" : "status"}>{text}</p> : null; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="ops-empty"><Search size={24}/><p>{children}</p></div>; }

function SanctionForm({ member, caseId, onDone }: { member: AdminMember; caseId?: string; onDone?: () => void }) {
  const [kind, setKind] = useState<AdminSanction["kind"]>("warn");
  const [minutes, setMinutes] = useState(60);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = applyAdminMemberAction({ name: member.name, kind, minutes, reason, caseId });
    setFeedback(resultText(result, caseId ? "Maatregel vastgelegd en melding afgesloten." : "Maatregel vastgelegd in de beheerdemo.")); setFailed(!result.ok);
    if (result.ok) { setReason(""); onDone?.(); }
  }
  if (member.role === "owner") return <div className="ops-info"><ShieldCheck size={17}/><p>De eigenaar is beschermd. Je kunt je eigen rol en toegang hier niet intrekken.</p></div>;
  return <form className="ops-form ops-sanction" onSubmit={submit}>
    <h3><Shield size={17}/> Maatregel vastleggen</h3>
    <div className="ops-form-grid"><label>Actie<select value={kind} onChange={event => setKind(event.target.value as AdminSanction["kind"])}><option value="warn">Waarschuwing</option><option value="mute">Chat beperken</option><option value="suspend">Tijdelijk schorsen</option></select></label>
      {kind !== "warn" && <label>Duur<select value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={10}>10 minuten</option><option value={60}>1 uur</option><option value={1440}>24 uur</option><option value={10080}>7 dagen</option><option value={43200}>30 dagen</option></select></label>}</div>
    <label>Reden<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Leg concreet vast waarom deze actie nodig is…" minLength={5} maxLength={600} rows={3} required/></label>
    <p className="ops-hint">Lokale demoactie. Er wordt geen echte speler gewaarschuwd of uitgelogd.</p>
    <button type="submit" className={kind === "suspend" ? "ops-button danger" : "ops-button primary"}><Shield size={15}/>{actionLabel[kind]}</button>
    <Message text={feedback} error={failed}/>
  </form>;
}

function MemberDetail({ member }: { member: AdminMember }) {
  const profile = useRatingProfile(member.name);
  const [role, setRole] = useState(member.role);
  const [feedback, setFeedback] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const now = useNow();
  return <div className="ops-member-detail">
    <div className="ops-detail-person"><div className={`ops-avatar role-${member.role}`}>{member.initials}</div><div><MemberName member={member}/><span>{member.country} · lid sinds {new Date(member.joinedAt).toLocaleDateString("nl-NL")}</span></div><span className={`ops-pill ${memberStatus(member, now)}`}>{statusLabel[memberStatus(member, now)]}</span></div>
    <div className="ops-metrics"><div><span>Elo</span><strong>{Math.round(profile.rating)}</strong><small>{profile.provisional ? "Plaatsingsfase" : "Geplaatst"}</small></div><div><span>Partijen</span><strong>{member.played}</strong><small>{member.wins} gewonnen</small></div><div><span>Gemiddelde</span><strong>{member.average.toFixed(1)}</strong><small>{member.oneEighties} × 180</small></div></div>
    <form className="ops-inline-form" onSubmit={event => { event.preventDefault(); const result = updateAdminMemberRole(member.name, role); setFeedback(resultText(result, "Rol opgeslagen.")); }}>
      <label>Platformrol<select value={member.role === "owner" ? "owner" : role} onChange={event => setRole(event.target.value as AdminMember["role"])} disabled={member.role === "owner"}>{member.role === "owner" ? <option value="owner">Eigenaar · beschermd</option> : <><option value="player">Speler</option><option value="vip">VIP</option><option value="admin">Admin</option></>}</select></label>
      <button type="submit" className="ops-button" disabled={member.role === "owner" || role === member.role}><Check size={15}/>Rol opslaan</button>
    </form><Message text={feedback}/>
    <SanctionForm member={member}/>
    <section className="ops-history"><h3>Moderatiegeschiedenis <span>{member.sanctions.length}</span></h3>{member.sanctions.length === 0 ? <p className="ops-hint">Er zijn geen maatregelen voor deze speler vastgelegd.</p> : [...member.sanctions].reverse().map(entry => <article key={entry.id}><div><strong>{actionLabel[entry.kind]}</strong><span>{entry.revokedAt ? "Ingetrokken" : entry.kind === "warn" ? "Vastgelegd" : entry.until > now ? `Tot ${dateTime(entry.until)}` : "Verlopen"}</span></div><p>{entry.reason}</p><small>{dateTime(entry.at)} · Nick</small>{!entry.revokedAt && entry.kind !== "warn" && entry.until > now && <button type="button" className="ops-text-button" onClick={() => { setRevokeId(entry.id); setRevokeReason(""); }}>Maatregel intrekken</button>}{revokeId === entry.id && <form className="ops-revoke" onSubmit={event => { event.preventDefault(); const result = revokeAdminMemberAction(member.name, entry.id, revokeReason); setFeedback(resultText(result, "Maatregel ingetrokken.")); if (result.ok) setRevokeId(""); }}><label>Reden voor intrekken<input value={revokeReason} onChange={event => setRevokeReason(event.target.value)} minLength={5} required maxLength={600}/></label><button className="ops-button" type="submit">Intrekken</button><button className="ops-text-button" type="button" onClick={() => setRevokeId("")}>Annuleren</button></form>}</article>)}</section>
  </div>;
}

export function AdminPlayers() {
  const { members } = useAdminOperations();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState("");
  const now = useNow();
  const filtered = members.filter(member => member.name.toLowerCase().includes(query.toLowerCase()) && (role === "all" || member.role === role) && (status === "all" || memberStatus(member, now) === status));
  const member = members.find(item => item.name === selected);
  return <div className="ops-module">
    <div className="ops-toolbar"><label className="ops-search"><Search size={16}/><input aria-label="Zoek speler" value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek een speler…"/></label><select aria-label="Filter op rol" value={role} onChange={event => setRole(event.target.value)}><option value="all">Alle rollen</option><option value="owner">Eigenaar</option><option value="admin">Admin</option><option value="vip">VIP</option><option value="player">Speler</option></select><select aria-label="Filter op status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Alle statussen</option><option value="active">Actief</option><option value="muted">Chat beperkt</option><option value="suspended">Geschorst</option></select><span className="ops-count"><Users size={16}/>{members.length} spelers</span></div>
    <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Speler</th><th>Rol</th><th>Elo</th><th>Partijen</th><th>Status</th><th><span className="sr-only">Open speler</span></th></tr></thead><tbody>{filtered.map(item => <tr key={item.name}><td><button className="ops-player-link" onClick={() => setSelected(item.name)}><span className={`ops-avatar role-${item.role}`}>{item.initials}</span><span><MemberName member={item}/><small>{item.country}</small></span></button></td><td><span className={`ops-role role-${item.role}`}>{roleLabel[item.role]}</span></td><td><PlayerRating name={item.name}/></td><td>{item.played}</td><td><span className={`ops-pill ${memberStatus(item, now)}`}>{statusLabel[memberStatus(item, now)]}</span></td><td><button className="ops-icon-button" aria-label={`Beheer ${item.name}`} onClick={() => setSelected(item.name)}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>
    {!filtered.length && <Empty>Geen spelers gevonden. Pas je filters aan.</Empty>}<p className="ops-table-note">{filtered.length} van {members.length} spelers</p>
    <Dialog open={Boolean(member)} onOpenChange={open => { if (!open) setSelected(""); }}><DialogContent className="ops-dialog"><DialogTitle>Spelerdossier</DialogTitle><DialogDescription>Profiel, rol en moderatie.</DialogDescription>{member && <MemberDetail member={member} key={member.name}/>}</DialogContent></Dialog>
  </div>;
}

function PlayerRating({ name }: { name: string }) { const profile = useRatingProfile(name); const displayed = Math.round(profile.rating); return <span className={`ops-rating ${profile.provisional ? "white" : displayed >= 1550 ? "green" : displayed < 1450 ? "red" : "amber"}`}>{displayed}</span>; }

function RoomForm({ room, onClose }: { room?: AdminRoom; onClose: (message?: string) => void }) {
  const { members } = useAdminOperations();
  const [form, setForm] = useState({ name: room?.name ?? "", subtitle: room?.subtitle ?? "", category: room?.category ?? "social", status: room?.status ?? "active", capacity: room?.capacity ?? 50, rules: room?.rules ?? "Respecteer elkaar. Geen spam of beledigingen. Speel eerlijk en maak je wedstrijd af.", minRating: room?.minRating ?? 0, maxRating: room?.maxRating ?? 4000, moderator: room?.moderator ?? "Nick" });
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); const result = saveAdminRoom({ ...form, id: room?.id }); if (result.ok) onClose(room ? "Kamer bijgewerkt." : "Kamer aangemaakt."); else setError(result.error); }
  function remove() { const result = deleteAdminRoom(room!.id); if (result.ok) onClose("Lege kamer verwijderd."); else setError(result.error); }
  return <form className="ops-form" onSubmit={submit}>
    <div className="ops-form-grid"><label>Kamernaam<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required minLength={3} maxLength={40} placeholder="Bijv. Haagse darters"/></label><label>Korte omschrijving<input value={form.subtitle} onChange={event => setForm({ ...form, subtitle: event.target.value })} maxLength={100} placeholder="De vaste hangout"/></label></div>
    <div className="ops-form-grid"><label>Categorie<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as AdminRoom["category"] })}>{Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Toegang<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as AdminRoom["status"] })}>{Object.entries(accessLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <div className="ops-form-grid"><label>Capaciteit<input type="number" min={Math.max(2, room?.count ?? 0)} max={50} value={form.capacity} required onChange={event => setForm({ ...form, capacity: Number(event.target.value) })}/><small>Maximaal 50. Nu {room?.count ?? 0} aanwezig.</small></label><label>Moderator<select value={form.moderator} onChange={event => setForm({ ...form, moderator: event.target.value })}>{members.filter(member => ["owner", "admin"].includes(member.role)).map(member => <option key={member.name} value={member.name}>{member.name}</option>)}</select></label></div>
    <div className="ops-form-grid"><label>Rating vanaf<input type="number" min={0} max={4000} value={form.minRating} required onChange={event => setForm({ ...form, minRating: Number(event.target.value) })}/></label><label>Rating tot en met<input type="number" min={form.minRating} max={4000} value={form.maxRating} required onChange={event => setForm({ ...form, maxRating: Number(event.target.value) })}/></label></div>
    <label>Kamerregels<textarea rows={4} value={form.rules} onChange={event => setForm({ ...form, rules: event.target.value })} maxLength={1500}/></label>
    <div className="ops-info"><DoorOpen size={17}/><p>{form.status === "closed" ? "Gesloten betekent: geen nieuwe instroom. Huidige spelers en wedstrijden blijven staan." : form.status === "private" ? "Deze kamer is in de demo alleen toegankelijk voor de eigenaar en admins; uitnodigingen krijgen later servercontrole." : "Open kamers zijn zichtbaar in de lobby. De capaciteit wordt bewaakt bij het binnengaan."}</p></div>
    <Message text={error} error/>
    <div className="ops-actions"><button className="ops-button primary" type="submit"><Check size={16}/>{room ? "Wijzigingen opslaan" : "Kamer aanmaken"}</button><button type="button" className="ops-button" onClick={() => onClose()}>Annuleren</button></div>
    {room && <div className="ops-delete-area">{room.count > 0 || room.matches > 0 ? <p className="ops-hint">Deze kamer is in gebruik en kan niet worden verwijderd. Sluit de toegang om instroom te stoppen.</p> : room.status !== "closed" ? <p className="ops-hint">Sluit eerst de kamer om deze te kunnen verwijderen.</p> : confirmDelete ? <div className="ops-delete-confirm"><span>Deze lege kamer definitief uit de demo verwijderen?</span><button type="button" className="ops-button danger" onClick={remove}>Ja, verwijderen</button><button type="button" className="ops-text-button" onClick={() => setConfirmDelete(false)}>Behouden</button></div> : <button type="button" className="ops-text-button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14}/>Lege kamer verwijderen</button>}</div>}
  </form>;
}

export function AdminRooms() {
  const { rooms } = useAdminOperations();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const visible = rooms.filter(room => `${room.name} ${room.subtitle}`.toLowerCase().includes(query.toLowerCase()) && (category === "all" || room.category === category));
  const editing = rooms.find(room => room.id === editId);
  return <div className="ops-module">
    <div className="ops-toolbar"><label className="ops-search"><Search size={16}/><input aria-label="Zoek kamer" value={query} onChange={event => setQuery(event.target.value)} placeholder="Zoek een kamer…"/></label><select aria-label="Filter kamercategorie" value={category} onChange={event => setCategory(event.target.value)}><option value="all">Alle categorieën</option>{Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="ops-count">{rooms.length} kamers · {rooms.filter(room => room.status === "active").length} open</span><button className="ops-button primary" onClick={() => setEditId("new")}><Plus size={16}/>Nieuwe kamer</button></div>
    <Message text={feedback}/><div className="ops-room-grid">{visible.map(room => <article className={`ops-room-card ${room.status}`} key={room.id}><div className="ops-room-top"><span className="ops-room-icon">{room.status === "private" ? <LockKeyhole size={20}/> : <DoorOpen size={20}/>}</span><span className={`ops-pill ${room.status}`}>{accessLabel[room.status]}</span></div><div className="ops-room-heading"><h3>{room.name}</h3><p>{room.subtitle || "Jouw plek aan de oche"}</p></div><div className="ops-room-population"><span><Users size={14}/>{room.count}<small> / {room.capacity} spelers</small></span><span>{room.matches} partijen</span></div><div className="ops-capacity" aria-label={`${room.count} van ${room.capacity} plaatsen bezet`}><i style={{ width: `${Math.min(100, room.count / room.capacity * 100)}%` }}/></div><div className="ops-room-meta"><span>{categoryLabel[room.category]}</span><span>Rating {room.minRating}–{room.maxRating}</span><span><Shield size={12}/>{room.moderator}</span></div><div className="ops-room-actions"><button className="ops-button" onClick={() => setEditId(room.id)}><SlidersHorizontal size={14}/>Bewerken</button>{room.status !== "closed" && <button className="ops-text-button" onClick={() => setFeedback(resultText(closeAdminRoom(room.id), `${room.name} is gesloten voor nieuwe instroom.`))}>Instroom sluiten</button>}</div></article>)}</div>
    {!visible.length && <Empty>Geen kamers gevonden.</Empty>}
    <Dialog open={editId !== null} onOpenChange={open => { if (!open) setEditId(null); }}><DialogContent className="ops-dialog"><DialogTitle>{editing ? editing.name : "Nieuwe kamer"}</DialogTitle><DialogDescription>Toegang, capaciteit en kamerregels.</DialogDescription>{editId !== null && <RoomForm room={editing} key={editId} onClose={message => { if (message) setFeedback(message); setEditId(null); }}/>}</DialogContent></Dialog>
  </div>;
}

function CaseDetail({ item }: { item: AdminCase }) {
  const { members } = useAdminOperations();
  const [response, setResponse] = useState(item.response);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  const member = members.find(player => player.name === item.player);
  function update(status: AdminCase["status"]) { const result = updateAdminCase(item.id, status, response); setFeedback(resultText(result, status === "resolved" ? "Melding afgesloten en beslissing vastgelegd." : "Behandelstatus bijgewerkt.")); setError(!result.ok); }
  return <section className="ops-case-detail">
    <div className="ops-case-detail-top"><span className={`ops-pill case-${item.status}`}>{caseLabel[item.status]}</span><span>{item.id}</span></div><h3>{item.reason}</h3><div className="ops-case-subject"><div className="ops-avatar"><UserRound size={20}/></div><span><strong>{item.player}</strong><small>Gemeld door {item.reporter} · {dateTime(item.at)}</small></span></div>
    <dl className="ops-context-grid"><div><dt>Kamer</dt><dd>{item.room || "Niet opgegeven"}</dd></div><div><dt>Game ID</dt><dd>{item.gameId ? `#${item.gameId.replace(/^#/, "")}` : "Geen wedstrijd"}</dd></div><div><dt>Bron</dt><dd>{item.source === "demo" ? "Fictief voorbeeld" : "Lokale spelermelding"}</dd></div></dl>
    <div className="ops-evidence"><h4>Context & bewijs</h4><p>{item.context || "De melder heeft geen aanvullende context meegestuurd."}</p></div>
    {item.response && <div className="ops-decision"><Check size={16}/><p>{item.response}</p></div>}
    <form className="ops-form" onSubmit={event => { event.preventDefault(); update("resolved"); }}><label>Behandelnotitie<textarea value={response} onChange={event => setResponse(event.target.value)} rows={3} maxLength={1200} placeholder="Beschrijf je bevinding en de gekozen vervolgstap…"/></label><div className="ops-actions">{item.status === "open" && <button type="button" className="ops-button" onClick={() => update("review")}><Clock3 size={15}/>In behandeling</button>}{item.status !== "resolved" ? <button type="submit" className="ops-button primary"><Check size={15}/>Afsluiten zonder maatregel</button> : <button type="button" className="ops-button" onClick={() => update("review")}>Melding heropenen</button>}</div><Message text={feedback} error={error}/></form>
    {item.status !== "resolved" && (member ? <SanctionForm member={member} caseId={item.id}/> : <p className="ops-hint">Deze naam staat niet in de lokale spelerslijst. Je kunt de melding beoordelen en afsluiten.</p>)}
  </section>;
}

export function AdminModeration() {
  const { cases } = useAdminOperations();
  const social = useDartsSocial();
  useEffect(() => syncAdminReports(social.reports), [social.reports]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AdminCase["status"]>("all");
  const [selected, setSelected] = useState("");
  const filtered = [...cases].reverse().filter(item => (status === "all" || item.status === status) && `${item.player} ${item.id} ${item.reason} ${item.gameId}`.toLowerCase().includes(query.toLowerCase()));
  const selectedCase = filtered.find(item => item.id === selected) ?? filtered[0];
  return <div className="ops-module">
    <div className="ops-toolbar"><label className="ops-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Speler, melding of Game ID…" aria-label="Zoek melding"/></label><select aria-label="Filter meldingstatus" value={status} onChange={event => { setStatus(event.target.value as typeof status); setSelected(""); }}><option value="all">Alle meldingen</option><option value="open">Nieuw</option><option value="review">In behandeling</option><option value="resolved">Afgesloten</option></select><span className="ops-count"><Flag size={16}/>{cases.filter(item => item.status !== "resolved").length} open</span></div>
    <div className="ops-moderation-layout"><div className="ops-case-list">{filtered.map(item => <button key={item.id} className={selectedCase?.id === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}><span className="ops-case-list-head"><span className={`ops-pill case-${item.status}`}>{caseLabel[item.status]}</span><small>{item.source === "demo" ? "VOORBEELD" : "MELDING"}</small></span><strong>{item.reason}</strong><span>{item.player} · {item.room}</span><small>{item.id} {item.gameId ? `· #${item.gameId.replace(/^#/, "")}` : ""}</small><ChevronRight size={16}/></button>)}{!filtered.length && <Empty>Geen meldingen bij dit filter.</Empty>}</div>{selectedCase ? <CaseDetail item={selectedCase} key={selectedCase.id}/> : <div className="ops-case-detail ops-empty"><ShieldCheck size={30}/><h3>Alles bijgewerkt</h3><p>Nieuwe lokale meldingen vanuit het spel verschijnen hier.</p></div>}</div>
  </div>;
}
