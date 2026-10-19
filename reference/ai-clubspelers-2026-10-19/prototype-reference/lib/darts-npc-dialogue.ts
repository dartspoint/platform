import { npcProfiles, type NpcProfile } from './darts-npc-profiles';

export type NpcDialogueFact = { id:string; kind:'match_completed'; matchId:string; room:string; participants:string[]; winnerId:string; at:number };
export type NpcDialogueContext = { npcId:string; room:string; humanId:string; humanName:string; now:number; npcAvailable:boolean; facts:NpcDialogueFact[] };
export type NpcDialogueRequirement = { kind:'match_completed'; eventId:string; matchId:string; subjectId:string };
export type NpcDialogueCandidate = { text:string; family:string; intent?:string; requirement?:NpcDialogueRequirement };
const FACT_MAX_AGE_MS=120_000;
const normalize=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const test=(text:string,pattern:RegExp)=>pattern.test(normalize(text));
export function classifyNpcIntent(prompt:string){
  let text=normalize(prompt);
  for(const p of npcProfiles){for(const address of [p.nickname,p.displayName.split(' ')[0]]){const prefix=normalize(address)+' ';if(text.startsWith(prefix))text=text.slice(prefix.length);}}
  if(!text)return 'empty';
  if(/\b(ai|bot|npc|robot|artificial intelligence)\b/.test(text))return 'identity';
  if(/\b(niet gespeeld|geen (game|potje|wedstrijd) gespeeld|haven t played|have not played|didn t play|never played)\b/.test(text))return 'no_game';
  if(/\b(geen zin (om te spelen|in (een )?(potje|partij|wedstrijd|game|darten))|wil niet (meer )?(spelen|darten)|liever niet spelen|hoef geen (potje|partij)|don t want to play|do not want to play|not playing|no game for me|not in the mood for a game)\b/.test(text))return 'decline';
  if(/\b(ik|i)\b/.test(text)&&/\b(180|gewonnen|verloren|finish|checkout|win|won|lost|scored)\b/.test(text)&&!/\b(wie|who|heb ik|did i|have i|wat|what|how|hoe)\b/.test(text))return 'unverified_claim';
  if(/\b(wie (heeft er |heeft )?gewonnen|heb ik gewonnen|heb jij gewonnen|uitslag|resultaat|who won|did i win|did you win|match result)\b/.test(text))return 'result_question';
  if(/\b(wat is|hoe werkt|hoe moet|what is|how does|how do)\b/.test(text)&&/\b(double out|dubbel uit|uitgooien|checkout|darts)\b/.test(text))return 'rules';
  if(/\b(hoe gaat|hoe is het|alles goed|how are you|how s it going|you alright)\b/.test(text))return 'wellbeing';
  const otherActivity=/\b(piano|gitaar|guitar|voetbal|football|soccer|marathon|school|werk|work|shopping|shop|chess|schaken|board games?|bordspellen|computer games?)\b/.test(text)&&!/\b(darts?|dartbord|dartboard)\b/.test(text);
  if(otherActivity)return 'unknown';
  if(/\b(oefenen|oefenpotje|oefenwedstrijd|practice|practise)\b/.test(text)&&!/\b(niet|geen|no|not) (oefenen|oefenpotje|oefenwedstrijd|practice|practise)\b/.test(text))return 'practice';
  if(/\b(geen dp|niet voor dp|no dp|not ranked|no ranked)\b/.test(text))return 'practice';
  if(/\b(dp|ranked|puntenwedstrijd)\b/.test(text))return 'ranked';
  if(/\b(revanche|rematch)\b/.test(text))return 'rematch';
  if(/\b(potje|darten|wedstrijd|game|match|uitnodiging|uitnodigen|nodig me uit|invite|spelen)\b/.test(text)&&!/\b(bordspel|bordspellen|board games?|voetbal|football|film|computer game)\b/.test(text))return 'game_request';
  if(/\b(tot later|doei|dag allemaal|bye|goodbye|see you|laters)\b/.test(text))return 'farewell';
  if(/\b(dank|dankje|bedankt|thanks|thank you)\b/.test(text))return 'thanks';
  if(/^(hoi|hallo|hey|he|hi|hello|good morning|good afternoon|good evening|goedemorgen|goedemiddag|goedenavond|yo)\b/.test(text))return 'greeting';
  return 'unknown';
}
function candidates(profile:NpcProfile,intent:string,nl:string[],en:string[],english:boolean):NpcDialogueCandidate[]{
  const lines=english?en:nl;
  const offset=[...profile.id].reduce((sum,c)=>sum+c.charCodeAt(0),0)%lines.length;
  return lines.map((_,i)=>{const n=(i+offset)%lines.length;return {text:lines[n],family:`grounded:${intent}:${n}`,intent};});
}
export function recentNpcMatch(context:NpcDialogueContext,subjectId=context.humanId){
  return context.facts.filter(f=>f.kind==='match_completed'&&f.room===context.room&&f.participants.includes(subjectId)&&f.participants.includes(context.npcId)&&f.participants.includes(f.winnerId)&&f.at<=context.now&&context.now-f.at<=FACT_MAX_AGE_MS).sort((a,b)=>b.at-a.at)[0];
}
function asksForOtherMatch(prompt:string,context?:NpcDialogueContext){
  let text=normalize(prompt);
  const current=npcProfiles.find(p=>p.id===context?.npcId);
  for(const address of current?[current.nickname,current.displayName,current.displayName.split(' ')[0]]:[]){
    text=text.split(' ').filter(word=>!normalize(address).split(' ').includes(word)).join(' ');
  }
  // A recent result does not establish which match an arbitrary sentence means.
  // Confirm only the small, unambiguous current-match vocabulary; clarify all
  // unknown names, dates, numbers, languages and qualifiers instead.
  const allowed=new Set('wie heeft er gewonnen verloren won heb ik jij we wij onze ons partij potje wedstrijd uitslag resultaat wat is was de het deze dit net zojuist hier van tegen jou mij ja who win lost did have has i you we our us match game result what is was the this just here against me yes'.split(' '));
  return text.split(' ').some(word=>!allowed.has(word));
}
export function npcCompletedMatchCandidate(fact:NpcDialogueFact,context:NpcDialogueContext,en:boolean,subjectId=context.npcId):NpcDialogueCandidate{
  const human=subjectId===context.humanId;
  const won=fact.winnerId===subjectId;
  return {text:human?(en?(won?'You won our match.':'I won our match.'):(won?'Jij hebt onze partij gewonnen.':'Ik heb onze partij gewonnen.')):(en?'Our match is finished. Good game!':'Onze partij is afgelopen. Lekker potje!'),family:human?`grounded:result:${won?'human':'npc'}`:'grounded:completed-match',intent:'match_result',requirement:{kind:'match_completed',eventId:fact.id,matchId:fact.matchId,subjectId}};
}
/** Claim checking is performed again at final publication, using current facts.
 * Human text is never converted into a confirmed fact. Example quotes are not
 * dialogue candidates. The local generator only selects audited intent pools.
 */
export function isNpcDialogueGrounded(text:string,context:NpcDialogueContext,requirement?:NpcDialogueRequirement){
  if(requirement){
    const fact=context.facts.find(f=>f.id===requirement.eventId&&f.matchId===requirement.matchId);
    if(!fact||fact.kind!==requirement.kind||fact.room!==context.room||!fact.participants.includes(context.npcId)||!fact.participants.includes(requirement.subjectId)||!fact.participants.includes(fact.winnerId)||fact.at>context.now||context.now-fact.at>FACT_MAX_AGE_MS)return false;
    if(test(text,/\bjij hebt onze partij gewonnen\b|\byou won our match\b/)&&fact.winnerId!==context.humanId)return false;
    if(test(text,/\bik heb onze partij gewonnen\b|\bi won our match\b/)&&fact.winnerId!==context.npcId)return false;
  }
  const claim=test(text,/\b(mooie|nette|netjes|prima|nice|great|lovely|good|well played)\b.*\b(dubbel|finish|checkout|double|worp|throw|pot|potje|game|match)\b|\b(die|jouw|your|that) (laatste |last )?(dubbel|finish|checkout|double|worp|throw)\b|\b(last|laatste|vorige) (double|dubbel|finish|checkout|worp|throw|beurt|turn)\b|\b(gewonnen|verloren|won our|lost our|partij is afgelopen|match is finished)\b/);
  return !claim||!!requirement;
}
export function buildNpcReplyCandidates(profile:NpcProfile,prompt:string,en=false,context?:NpcDialogueContext):NpcDialogueCandidate[]{
  const intent=classifyNpcIntent(prompt);
  if(intent==='empty')return [];
  if(intent==='identity')return candidates(profile,intent,['Ja, ik ben een AI-clubkarakter van DartsPoint.','Klopt, ik ben een van de fictieve clubspelers hier.'],['Yes, I’m a DartsPoint AI club character.','That’s right, I’m one of the fictional club players here.'],en);
  if(intent==='greeting')return candidates(profile,intent,['Hoi! Alles goed?','Hey, gezellig dat je er bent.','Hoi! Zin om even te kletsen?','Ha, hoe gaat ie?','Hallo daar! Waar heb je zin in?','Hey! Hoe is je avond?','Hoi! Even rustig rondkijken?','Ha, schuif gezellig aan.'],['Hey! How’s it going?','Hi, good to see you here.','Hello! Fancy a chat?','Hey there, how are you?','Hi! What are you in the mood for?','Hey! How’s your evening?','Hello! Taking a look around?','Hi, make yourself comfortable.'],en);
  if(intent==='no_game')return candidates(profile,intent,['Dan gewoon even kletsen. Waar heb je zin in?','Je hoeft ook niet meteen een partij te starten.'],['We can just chat. What are you in the mood for?','No need to start a match straight away.'],en);
  if(intent==='decline')return candidates(profile,intent,['Helemaal goed, dan gewoon even kletsen.','Prima hoor, geen haast.'],['No worries, we can just chat.','That’s fine, no rush.'],en);
  if(intent==='wellbeing')return candidates(profile,intent,['Prima hier. En met jou?','Gezellig zo in de kamer. Hoe is het met jou?'],['All good here. How about you?','Enjoying the chat here. How are you doing?'],en);
  if(intent==='unverified_claim'){
    const fact=context&&recentNpcMatch(context);
    const claim=normalize(prompt);
    const resultOnly=!asksForOtherMatch(prompt,context)&&!/\b(180|finish|checkout|scored|voetbal|football|marathon|tennis)\b/.test(claim);
    const won=/\b(gewonnen|won|win)\b/.test(claim),lost=/\b(verloren|lost)\b/.test(claim);
    if(fact&&context&&resultOnly&&((won&&fact.winnerId===context.humanId)||(lost&&fact.winnerId===context.npcId)))return [npcCompletedMatchCandidate(fact,context,en,context.humanId)];
    return candidates(profile,intent,['Bedoel je een partij hier? Ik kan worpen of uitslagen zo niet bevestigen.','Daar heb ik hier geen bevestigde spelgebeurtenis van.'],['Do you mean a match here? I can’t confirm throws or results from that alone.','I don’t have a confirmed game event for that here.'],en);
  }
  if(intent==='result_question'){
    const fact=context&&!asksForOtherMatch(prompt,context)&&recentNpcMatch(context);
    if(fact)return [npcCompletedMatchCandidate(fact,context!,en,context!.humanId)];
    return candidates(profile,intent,['Ik heb hier geen bevestigde uitslag van een partij tussen ons.','Welke partij bedoel je? Ik zie hier geen bevestigde uitslag tussen ons.'],['I don’t have a confirmed result for a match between us here.','Which match do you mean? I don’t have a confirmed result between us here.'],en);
  }
  if(intent==='rules')return candidates(profile,intent,['Bij dubbel-uit moet de laatste pijl op een dubbel vallen; de bull telt ook als dubbel.','Voor dubbel-uit moet je precies op nul eindigen met een dubbel.'],['With double out, the final dart must land on a double; the bull counts too.','For double out you need to reach exactly zero with a double.'],en);
  if(intent==='practice')return candidates(profile,intent,['Oefenen dus? Dat kun je kiezen bij je uitnodiging.','Een oefenpartij is zonder DP. De spelopties staan bij de uitnodiging.'],['Practice, then? You can choose it in the invitation.','Practice games don’t change DP. The invitation shows the game options.'],en);
  if(intent==='ranked')return candidates(profile,intent,['Voor DP spelen kun je bij de uitnodiging kiezen. Bekijk de instellingen even voor je accepteert.','De uitnodiging laat zien of een partij voor DP is.'],['You can choose DP in the invitation. Check the settings before accepting.','The invitation shows whether a match is for DP.'],en);
  if(intent==='rematch')return candidates(profile,intent,['Een nieuw potje? Welke instellingen had je in gedachten?','Je kunt een nieuwe uitnodiging sturen met de spelopties die je wilt.'],['Another game? What settings did you have in mind?','You can send a new invitation with the game options you want.'],en);
  if(intent==='game_request')return candidates(profile,intent,['Wat lijkt je leuk: oefenen of voor DP?','Je kunt via de spelerslijst een uitnodiging met spelopties sturen.'],['What would you prefer: practice or DP?','You can send an invitation with game options from the player list.'],en);
  if(intent==='farewell')return candidates(profile,intent,['Tot later!','Doei, fijne avond nog.'],['See you later!','Bye, have a good evening.'],en);
  if(intent==='thanks')return candidates(profile,intent,['Graag gedaan.','Geen probleem hoor.'],['You’re welcome.','No problem at all.'],en);
  const lower=normalize(prompt);
  const interest=profile.interests.find(i=>normalize(i).split(' ').some(word=>word.length>3&&lower.split(' ').includes(word)));
  if(interest)return [{text:en?'That’s one of my interests. What got you into it?':`${interest[0].toUpperCase()+interest.slice(1)} vind ik interessant. Wat vind jij er leuk aan?`,family:`grounded:interest:${normalize(interest)}`,intent:'interest'}];
  return candidates(profile,'clarify',['Wat bedoel je precies?','Kun je daar iets meer over zeggen?','Ik volg je nog niet helemaal. Waar gaat het over?'],['What do you mean exactly?','Could you tell me a little more?','I’m not quite following. What are you referring to?'],en);
}
export function npcAmbientCandidates(profile:NpcProfile,en=false):NpcDialogueCandidate[]{
  return candidates(profile,'ambient',['Waar hebben jullie het over?','Wat doen jullie liever: even kletsen of een potje?','Iemand een leuk onderwerp voor tussendoor?','Met welke dubbel oefenen jullie het liefst?'],['What are you chatting about?','Would you rather chat for a bit or play a game?','Anyone got a good topic for a chat?','Which double do you like practising?'],en);
}
