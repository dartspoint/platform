export type AuditRecord={id:string;at:number;actor:string;action:string;subject:string;detail:string;data?:Record<string,any>;subjectName?:string};
const roles:Record<string,string>={player:'Speler',vip:'VIP',admin:'Platformbeheerder',owner:'Eigenaar'};
const words:Record<string,string>={open:'Open',active:'Actief',closed:'Gesloten',private:'Privé',review:'In behandeling',resolved:'Afgehandeld',registration:'Inschrijving',checkin:'Inchecken',live:'Actief',completed:'Voltooid',draft:'Concept',social:'Sociaal',ranked:'Competitief',beginners:'Ontspannen',tournament:'Toernooi'};
export function auditWord(value:unknown){if(typeof value!=='string')return 'Onbekend';return roles[value]??words[value]??'Onbekend';}
const actions:Record<string,string>={
 'tournament.createTournament':'heeft een toernooi aangemaakt',
 'tournament.updateTournament':'heeft een toernooi bijgewerkt',
 'tournament.cloneTournament':'heeft een toernooi gekopieerd',
 'tournament.setTournamentPublished':'heeft de publicatie van een toernooi gewijzigd',
 'tournament.setTournamentStatus':'heeft de status van een toernooi gewijzigd',
 'tournament.generateTournamentBracket':'heeft het toernooischema gemaakt',
 'tournament.resetTournamentBracket':'heeft het toernooischema hersteld',
 'tournament.startTournament':'heeft een toernooi gestart',
 'tournament.addTournamentParticipant':'heeft een toernooideelnemer toegevoegd',
 'tournament.updateTournamentParticipant':'heeft een toernooideelnemer bijgewerkt',
 'tournament.removeTournamentParticipant':'heeft een toernooideelnemer verwijderd',
 'tournament.setTournamentReady':'heeft toernooigereedheid bevestigd',
 'tournament.startTournamentMatch':'heeft een toernooiwedstrijd gestart',
 'tournament.assignTournamentBoard':'heeft een toernooibord toegewezen',
 'tournament.recordTournamentResult':'heeft een toernooiresultaat verwerkt',
 'tournament.scheduled':'heeft toernooiwedstrijden ingepland',
 'tournament.match-finalized':'heeft een wedstrijdresultaat verwerkt',
 'division.createDivisionSeason':'heeft een seizoen aangemaakt',
 'division.updateDivisionSeason':'heeft een seizoen bijgewerkt',
 'division.createNextDivisionSeason':'heeft het volgende seizoen voorbereid',
 'division.completeDivisionSeason':'heeft een seizoen afgesloten',
 'division.addSeasonDivision':'heeft een divisie toegevoegd',
 'division.updateSeasonDivision':'heeft een divisie bijgewerkt',
 'division.removeSeasonDivision':'heeft een divisie verwijderd',
 'division.addDivisionMember':'heeft een divisiedeelnemer toegevoegd',
 'division.moveDivisionMember':'heeft een divisiedeelnemer verplaatst',
 'division.removeDivisionMember':'heeft een divisiedeelnemer verwijderd',
 'division.generateDivisionSchedule':'heeft het divisieschema gemaakt',
 'division.startDivisionSeason':'heeft een seizoen gestart',
 'division.recordDivisionResult':'heeft een divisieresultaat verwerkt',
 'division.match-finalized':'heeft een divisiewedstrijd verwerkt',
 'profile.onboard':'heeft een spelersprofiel voltooid','profile.rename':'heeft de spelersnaam gewijzigd','profile.rename-required':'heeft een naamswijziging verplicht gesteld','member.role':'heeft de platformrol gewijzigd',
 'chat.filter.save':'heeft een filterregel bijgewerkt','chat.limits':'heeft de chatlimieten gewijzigd','chat.message.redact':'heeft een chatbericht verwijderd',
 'room.save':'heeft de kamer bijgewerkt','room-close':'heeft de kamer gesloten','room-delete':'heeft de kamer verwijderd',
 'room.moderator.assigned':'heeft kamerbeheerrechten toegewezen','room.moderator.revoked':'heeft kamerbeheerrechten ingetrokken',
 'moderation.warn':'heeft een waarschuwing gegeven','moderation.mute':'heeft een chatmute ingesteld','moderation.remove':'heeft een speler uit de kamer verwijderd','moderation.suspend':'heeft een speler geschorst',
 'sanction.revoke':'heeft een sanctie ingetrokken','report.create':'heeft een melding ingediend',
 'case.open':'heeft een melding heropend','case.review':'heeft een melding in behandeling genomen','case.resolved':'heeft een melding afgehandeld',
 'settings.save':'heeft de platforminstellingen bijgewerkt','owner.bootstrap':'heeft de eerste eigenaar ingesteld',
 'tournament.create':'heeft een toernooi aangemaakt','tournament.save':'heeft een toernooi bijgewerkt','tournament.publish':'heeft een toernooi gepubliceerd','tournament.start':'heeft een toernooi gestart',
 'division.create':'heeft een seizoen aangemaakt','division.save':'heeft een seizoen bijgewerkt','division.start':'heeft een seizoen gestart','division.close':'heeft een seizoen afgesloten'
};
export function dedupeAudit<T extends {id:string}>(entries:readonly T[]){return [...new Map(entries.map(e=>[e.id,e])).values()];}
export function formatAudit(entry:AuditRecord){
 let data=entry.data??{};if(!entry.data){try{const parsed=JSON.parse(entry.detail);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed;}catch{}}
 const actor=entry.actor||'Onbekende beheerder';
 const subject=entry.subjectName||data.subjectName||(!/^[0-9a-f-]{36}$/i.test(entry.subject)&&entry.subject.length<100?entry.subject:'Verwijderd of onbekend onderwerp');
 let action=actions[entry.action]??'heeft een niet-herkende beheeractie geregistreerd',change='';
 if(entry.action==='member.role')change=data.beforeRole?`${auditWord(data.beforeRole)} → ${auditWord(data.role)}`:auditWord(data.role);
 if(entry.action==='room.save'){
  if(data.before?.name&&data.after?.name&&data.before.name!==data.after.name){action='heeft de kamernaam gewijzigd';change=`${data.before.name} → ${data.after.name}`;}
  else if(data.created===true)action='heeft een kamer aangemaakt';
  else if(data.before?.status&&data.after?.status&&data.before.status!==data.after.status)change=`${auditWord(data.before.status)} → ${auditWord(data.after.status)}`;
 }
 if(entry.action.startsWith('room.moderator.'))change=data.roomName||'Onbekende kamer';
 if(entry.action==='chat.filter.save'){
  if(data.created)action='heeft een filterregel toegevoegd';
  const version=data.before?.version?`Versie ${data.before.version} → ${data.after?.version}`:`Versie ${data.after?.version??'onbekend'}`;
  change=[version,data.after?.active===false?'Uitgeschakeld':'Actief',data.after?.allow?'Uitzondering':'Blokkade'].join(' · ');
 }
 if(entry.action==='chat.limits')change=`Instellingenversie ${data.before?.version??'onbekend'} → ${data.after?.version??'onbekend'}`;
 if(entry.action==='profile.rename')change=data.before?.username&&data.after?.username?`${data.before.username} → ${data.after.username}`:'';
 if(entry.action==='profile.rename-required')change='De speler kiest bij de volgende actie een toegestane naam';
 if(['chat.filter.save','chat.limits','chat.message.redact','profile.rename-required'].includes(entry.action)&&entry.detail&&entry.detail[0]!=='{')change=[change,entry.detail].filter(Boolean).join(' · ');
 const localTime=new Date(entry.at).toLocaleString('nl-NL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const summary=`${actor} ${action}.`;
 return {actor,action,subject,change,summary,localTime,technical:{code:entry.action,subjectId:entry.subject,data,detail:entry.detail}};
}
