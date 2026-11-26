"use client";

import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {Check, Link2, RefreshCw, Trash2} from 'lucide-react';
import {useI18n} from '@/lib/i18n/provider';
import {blogUi as ui} from './blog-ui';
import './blog-socialhero.css';

type Connection = {
  connectionId: string;
  destinationId: string;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  environment: string;
  siteId: string;
  origin: string;
  scopes: string[];
  publishEnabled: boolean;
};
type ConnectionResult = {connection: Connection | null; configured: boolean};
type Command = {action: 'pair'; code: string} | {action: 'check' | 'disconnect'} | {action: 'policy'; publishEnabled: boolean};
type Notice = {code?: string; message?: string; requestId?: string};

const statusLabels: Record<Connection['status'], string> = {
  pending: 'Wacht op bevestiging', active: 'Actief', expired: 'Verlopen', revoked: 'Ontkoppeld',
};
const scopeLabels: Record<string, string> = {
  read: 'Verbinding en artikelstatus uitlezen',
  draft: 'Media uploaden en concepten beheren',
  publish: 'Artikelen publiceren',
};
const errorMessages: Record<string, string> = {
  INVALID_PAIRING_CODE: 'Deze koppelcode is ongeldig of al gebruikt. Maak een nieuwe code in SocialHero.',
  PAIRING_EXPIRED: 'Deze koppelcode of installatie is verlopen. Maak een nieuwe code in SocialHero en koppel opnieuw.',
  DESTINATION_MISMATCH: 'Deze code hoort bij een andere website of omgeving. Maak in SocialHero een code voor deze website en omgeving.',
  PAIRING_IN_PROGRESS: 'De installatie is nog niet afgerond. Gebruik Verbinding controleren om verder te gaan.',
  INVALID_CREDENTIAL: 'De verbinding is niet meer geldig. Maak een nieuwe koppelcode in SocialHero.',
  PERMISSION_DENIED: 'Deze actie is niet toegestaan. Controleer je rechten op de website en in SocialHero.',
  RATE_LIMITED: 'Er zijn te veel pogingen gedaan. Wacht even en probeer het opnieuw.',
  SOCIALHERO_CONFIGURATION_INVALID: 'De SocialHero-koppeling is nog niet ingesteld voor deze website.',
  SOCIALHERO_UNAVAILABLE: 'SocialHero is tijdelijk niet bereikbaar. Je invoer blijft staan. Probeer opnieuw of controleer de verbinding.',
};

class ConnectionRequestError extends Error {
  constructor(readonly notice: Notice) { super(notice.message); }
}

async function connectionRequest(command?: Command): Promise<ConnectionResult> {
  const response = await fetch('/api/blog-admin/socialhero', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {'Accept': 'application/json', ...(command ? {'Content-Type': 'application/json'} : {})},
    ...(command ? {method: 'POST', body: JSON.stringify(command)} : {}),
  });
  const result = await response.json().catch(() => null) as (ConnectionResult & Notice) | null;
  if (!response.ok || !result || typeof result.configured !== 'boolean') {
    throw new ConnectionRequestError({code: result?.code, message: result?.message, requestId: result?.requestId});
  }
  return result;
}

function noticeFor(cause: unknown): Notice {
  return cause instanceof ConnectionRequestError ? cause.notice : {
    message: 'De server is tijdelijk niet bereikbaar. Je invoer blijft staan. Probeer het opnieuw.',
  };
}

export function BlogCredentials() {
  useI18n();
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Command['action'] | 'load' | null>('load');
  const [error, setError] = useState<Notice | null>(null);
  const [feedback, setFeedback] = useState('');
  const connection = result?.connection;
  const configured = result?.configured === true;

  const load = useCallback(async () => {
    setBusy('load');
    setError(null);
    try { setResult(await connectionRequest()); }
    catch (cause) { setError(noticeFor(cause)); }
    finally { setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(command: Command) {
    const removesAccess = command.action === 'disconnect' || (command.action === 'policy' && !command.publishEnabled);
    if (busy || (!configured && !removesAccess)) return;
    setBusy(command.action);
    setError(null);
    setFeedback('');
    try {
      const updated = await connectionRequest(command);
      setResult(updated);
      if (command.action === 'pair' || (command.action === 'check' && updated.connection?.status === 'active')) setCode('');
      if (command.action === 'disconnect') setFeedback('SocialHero is ontkoppeld.');
      else if (command.action === 'policy') setFeedback(updated.connection?.publishEnabled ? 'SocialHero mag nu artikelen publiceren.' : 'Publiceren via SocialHero is uitgeschakeld.');
      else if (updated.connection?.status === 'active') setFeedback(command.action === 'pair' ? 'SocialHero is gekoppeld.' : 'De lokale verbindingsstatus is gecontroleerd: actief.');
      else if (updated.connection?.status === 'pending') setFeedback('De installatie wacht nog op bevestiging. Gebruik Verbinding controleren om de installatie af te ronden.');
      else if (updated.connection?.status === 'expired') setFeedback('De installatie is verlopen. Maak een nieuwe koppelcode in SocialHero.');
      else setFeedback('Er is geen actieve SocialHero-verbinding. Koppel opnieuw met een nieuwe code.');
    } catch (cause) {
      setError(noticeFor(cause));
      // A failed response may still have committed pending provisioning or revocation.
      // Reload only the safe status; preserve the code and the original error for retry.
      try { setResult(await connectionRequest()); } catch { /* Keep the last known status. */ }
    }
    finally { setBusy(null); }
  }

  function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim()) void run({action: 'pair', code: code.trim()});
  }

  function disconnect() {
    if (busy || !window.confirm(ui('SocialHero ontkoppelen? SocialHero kan daarna geen concepten meer aanleveren of artikelen publiceren.'))) return;
    void run({action: 'disconnect'});
  }

  return <section className="adm-panel dpba-panel dpba-credentials dpba-socialhero" aria-busy={!!busy}>
    <h2 className="dpba-panel-title"><Link2 size={17}/>{ui('SocialHero')}</h2>
    <p className="dpba-help dpba-socialhero-intro">{ui('Open de blogkoppeling in SocialHero en maak een koppelcode voor deze website en omgeving. Plak de code hieronder. De code is 10 minuten geldig.')}</p>

    {error && <div className="dpba-notice dpba-notice--error" role="alert"><span>{ui(errorMessages[error.code ?? ''] ?? error.message ?? 'De verbinding kon niet worden bijgewerkt. Probeer het opnieuw.')}{error.requestId && <small className="dpba-socialhero-request">{ui('Referentie: {requestId}', {requestId: error.requestId})}</small>}</span></div>}
    {feedback && <p className={`dpba-notice${connection?.status === 'active' || !connection ? ' dpba-notice--success' : ''}`} role="status"><Check size={16}/><span>{ui(feedback)}</span></p>}
    {busy === 'load' && <p className="dpba-help" role="status">{ui('Verbinding laden…')}</p>}
    {result && !configured && <p className="dpba-notice" role="status">{ui('De SocialHero-koppeling is nog niet ingesteld voor deze website.')}</p>}

    <form className="dpba-socialhero-pairing" onSubmit={pair}>
      <label className="dpba-field"><span>{ui('Eenmalige koppelcode')}</span><input name="socialhero-pairing-code" value={code} type="text" maxLength={512} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={!!busy || !configured} onChange={event => setCode(event.target.value)} aria-describedby="dpba-socialhero-code-help"/></label>
      <button className="adm-btn" type="submit" disabled={!!busy || !configured || !code.trim()}><Link2 size={15}/>{busy === 'pair' ? ui('Koppelen…') : connection ? ui('Opnieuw koppelen') : ui('Koppelen')}</button>
      <p id="dpba-socialhero-code-help" className="dpba-help">{ui('De code wordt alleen gebruikt om deze website veilig aan SocialHero te koppelen.')}</p>
    </form>

    {result && <div className="dpba-socialhero-connection">
      <dl className="dpba-socialhero-details">
        <div><dt>{ui('Status')}</dt><dd><span className={`dpba-status dpba-status--${connection?.status === 'active' ? 'live' : connection?.status === 'pending' ? 'revision' : 'draft'}`}><i aria-hidden="true"/>{ui(connection ? statusLabels[connection.status] : 'Niet gekoppeld')}</span></dd></div>
        {connection && <><div><dt>{ui('Omgeving')}</dt><dd>{ui(connection.environment === 'production' ? 'Productie' : connection.environment === 'staging' ? 'Staging' : connection.environment)}</dd></div><div><dt>{ui('Website')}</dt><dd>{connection.origin}</dd></div><div><dt>{ui('Rechten')}</dt><dd>{connection.scopes.length ? <ul>{connection.scopes.map(scope => <li key={scope}>{ui(scopeLabels[scope] ?? scope)}</li>)}</ul> : ui('Geen actieve rechten')}</dd></div></>}
      </dl>

      {connection?.status === 'pending' && <p className="dpba-help">{ui('De installatie is onderbroken of wacht op bevestiging. Verbinding controleren hervat de verificatie veilig.')}</p>}
      {(connection?.status === 'expired' || connection?.status === 'revoked') && <p className="dpba-help">{ui('Maak een nieuwe koppelcode in SocialHero om deze website opnieuw te verbinden.')}</p>}

      {connection && <label className="dpba-socialhero-policy"><input type="checkbox" checked={connection.publishEnabled} disabled={!!busy || connection.status !== 'active' || (!configured && !connection.publishEnabled)} onChange={event => void run({action: 'policy', publishEnabled: event.target.checked})} aria-describedby="dpba-socialhero-publish-help"/><span>{ui('SocialHero mag artikelen publiceren')}<small id="dpba-socialhero-publish-help">{ui('Publiceren staat standaard uit. Schakel dit alleen in als SocialHero goedgekeurde artikelen op deze website mag publiceren.')}</small></span></label>}

      <div className="dpba-actions dpba-socialhero-actions">
        {connection && configured && <button className="adm-btn" type="button" disabled={!!busy} onClick={() => void run({action: 'check'})}><RefreshCw size={14}/>{busy === 'check' ? ui('Controleren…') : ui('Verbinding controleren')}</button>}
        {connection && (connection.status === 'active' || connection.status === 'pending') && <button className="adm-btn" type="button" disabled={!!busy} onClick={disconnect}><Trash2 size={14}/>{busy === 'disconnect' ? ui('Ontkoppelen…') : ui('Ontkoppelen')}</button>}
        {!configured && <button className="adm-btn" type="button" disabled={!!busy} onClick={() => void load()}><RefreshCw size={14}/>{ui('Opnieuw laden')}</button>}
      </div>
    </div>}
    {!result && !busy && <button className="adm-btn" type="button" onClick={() => void load()}><RefreshCw size={14}/>{ui('Opnieuw laden')}</button>}
  </section>;
}
