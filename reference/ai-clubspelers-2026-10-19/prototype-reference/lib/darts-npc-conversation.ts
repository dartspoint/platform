import type { NpcProfile } from './darts-npc-profiles';
import type { NpcTextCandidate } from './darts-npc-text';

export type NpcConversationPlan = { topic:string; turns: [string,string,string,string,string]; };
type Topic = { id:string; interests:RegExp; nl:NpcConversationPlan['turns']; en:NpcConversationPlan['turns']; };
// Authored, finite local conversations. Each following sentence answers the
// previous one. Translation pairs share a family; style never creates novelty.
const topics:Topic[] = [
  {id:'double-choice',interests:/schaken|puzzel/,nl:["Als je mag kiezen: dubbel 16 of tops?", "Dubbel 16. Mis ik naar binnen, dan blijft dubbel acht over.", "Ik pak toch tops. Maar die misser naar vijf...", "Ja, dan kun je meteen weer gaan rekenen.", "Bij tops moet je na een misser soms weer rekenen."],en:["If you can choose: double 16 or tops?", "Double 16. An inside miss still leaves double eight.", "I still prefer tops. Apart from that stray five...", "Yeah, then you’re straight back to counting.", "With tops, a miss can leave you counting again."]},
  {id:'practice-focus',interests:/sport|fietsen|hardlopen/,nl:["Dubbels oefenen of gewoon een hele leg spelen?", "Dubbels. Dat laatste pijltje vind ik interessanter dan hoge scores.", "Tien keer dezelfde? Of afwisselen?", "Eerst dezelfde. Anders kies ik steeds de makkelijkste.", "Ha, dat is ook een manier om beter te lijken."],en:["Practise doubles or just play a full leg?", "Doubles. That last dart interests me more than big scores.", "Ten at the same one? Or switch around?", "Same one first. Otherwise I keep picking the easiest.", "Ha, that’s one way to look better."]},
  {id:'music-focus',interests:/muziek|jazz|vinyl|drum|synth|ambient/,nl:["Muziek aan tijdens een partij, of liever stil?", "Zachtjes. Maar zonder zang, anders raak ik afgeleid.", "Dus geen meezingers op een beslissende dubbel?", "Liever niet. Een drumsolo ook maar even bewaren.", "Na een partij pas, dan."],en:["Music during a match, or would you rather have quiet?", "Quiet music. No lyrics though, they distract me.", "So no singalongs on the deciding double?", "Rather not. Save the drum solo as well.", "After a match, then."]},
  {id:'boardgame-choice',interests:/bordspel|schaken|game|puzzel/,nl:["Liever samen winnen of elkaar dwarszitten bij een bordspel?", "Samen. Tot één iemand voor de hele tafel gaat denken.", "Die is dan ineens de baas over jouw beurt.", "Precies. Geef mij maar een eigen slechte beslissing.", "Wel zo eerlijk als het misgaat."],en:["Board games: work together or get in each other’s way?", "Together. Until one person starts thinking for the whole table.", "Suddenly they’re in charge of your turn too.", "Exactly. Let me make my own bad decision.", "At least the blame is fair when it goes wrong."]},
  {id:'photo-attention',interests:/fotografie|sketch|illustratie|ontwerp/,nl:["Eerst het licht of wat er op de foto staat?", "Licht. Een lelijke muur kan ineens best mooi zijn.", "Haha ja, tot je de rest van die straat ziet.", "Die hoeft gelukkig niet op de foto.", "Gewoon een stap dichterbij dus."],en:["What catches you first in a photo: light or subject?", "Light. An ugly wall can suddenly look pretty good.", "Haha, until you see the rest of that street.", "Luckily that doesn’t have to be in the picture.", "Just take a step closer, then."]},
  {id:'cooking-method',interests:/koken|brood|koffie|tuin/,nl:["Recept volgen of onderweg maar wat proberen?", "Eerste keer volgen. Daarna begint het schuiven met ingrediënten.", "Ook met brood? Dat lijkt me minder vergevingsgezind.", "Nee, deeg wint die discussie meestal.", "Dan mag de weegschaal voor één keer gelijk hebben."],en:["Follow the recipe or make it up along the way?", "Follow it first time. Start swapping ingredients after that.", "Even with bread? Seems less forgiving.", "No, dough usually wins that argument.", "The scales can be right for once, then."]},
  {id:'film-ending',interests:/film|theater|documentaire|animatie|strips/,nl:["Open einde: mooi, of gewoon irritant?", "Mooi, als ik wel iets heb om over na te denken.", "Dus geen zwart scherm en zoek het maar uit?", "Precies. Eén kleine aanwijzing is genoeg.", "Dan ga ik de eerste scène weer wantrouwen."],en:["Open endings: good, or just annoying?", "Good, if there’s something there to think about.", "So not just a black screen and work it out yourself?", "Exactly. One little clue is enough.", "Then I start getting suspicious of the opening scene."]},
  {id:'walking-route',interests:/wandeling|hiken|kust|geologie|klimmen/,nl:["Vast rondje wandelen of ergens zomaar afslaan?", "Afslaan. Maar wel ongeveer weten waar ik uitkom.", "Anders wordt dat kleine ommetje ineens twaalf kilometer.", "Een herkenbaar punt op de terugweg helpt wel.", "En niet ieder zijpaadje nemen, vermoed ik."],en:["A familiar walking route or a random turning?", "A turning. But with some idea where I’ll end up.", "Otherwise that little detour becomes twelve kilometres.", "Having a landmark on the way back helps.", "And not taking every side path, I suppose."]},
  {id:'retro-design',interests:/retro|elektronica|programmer|gameontwerp|robotica/,nl:["Waarom blijft zo’n simpel oud spel toch leuk?", "Je snapt het meteen. Daarna blijkt het lastig genoeg.", "Geen twintig schermen uitleg voordat je iets mag doen.", "Nee. Eén knop, en toch steeds net te laat.", "Die knop krijgt natuurlijk de schuld."],en:["Why are those simple old games still so good?", "You get it straight away. Still hard enough after that.", "No twenty screens of instructions before you can do anything.", "No. One button, and somehow you’re still too late.", "The button gets the blame, obviously."]},
  {id:'creative-patience',interests:/keramiek|hout|textiel|boekbind|illustratie/,nl:["Eerst een plan maken of gewoon beginnen?", "Een klein proefstukje. Dan zie ik sneller wat niet werkt.", "Dus niet meteen drie uur aan het mooiste detail zitten?", "Liever niet, als de rest daarna niet blijkt te passen.", "Dat detail krijgt dan vast een eigen project."],en:["Make a plan first or just start?", "A small test piece. Quicker to see what doesn’t work.", "So not three hours on the nicest detail first?", "Rather not, if the rest then turns out not to fit.", "That detail probably gets its own project, then."]},
  {id:'space-question',interests:/sterren|ruimte|sciencefiction/,nl:["Ruimteverhalen: vooral de techniek of juist het onbekende?", "Het onbekende. Laat dat vreemde signaal maar even onverklaard.", "Als ze het niet oplossen met weer een nieuw apparaat.", "Ja, ineens kan die scanner alles. Wel erg handig.", "Behalve een spannend einde maken."],en:["Space stories: the technology or the unknown?", "The unknown. Leave that strange signal unexplained for a bit.", "As long as they don’t fix it with another new gadget.", "Yeah, suddenly the scanner can do everything. Very convenient.", "Apart from make a decent ending."]},
  {id:'short-format',interests:/./,nl:["Best of three, of meteen een lange partij?", "Kort beginnen heeft mijn voorkeur. Een revanche blijft optioneel.", "Ja, bij een kort format hoef je niet meteen een uur te plannen.", "Bij een spannend potje zou een extra partij me wel leuk lijken.", "Klinkt als een goede reden om het format kort te houden."],en:["Best of three, or straight into a long match?", "I prefer starting short. A rematch can stay optional.", "A short format does not need a whole hour blocked out.", "If a game were close, another match could be fun.", "Sounds like a good reason to keep the format short."]},
];

export function styleNpcConversationText(profile:NpcProfile,text:string,en:boolean):string {
  const style=(profile as NpcProfile & {writingStyle?:{capitalization?:string;punctuation?:string;fragments?:boolean;casualExpressions?:{nl?:string[];en?:string[]}}}).writingStyle;
  let result=text;
  const informalCase=style?.capitalization==='mixed'&&[...text].reduce((sum,char)=>sum+char.charCodeAt(0),0)%3===0;
  if(style?.capitalization==='lowercase'||informalCase)result=result.toLocaleLowerCase(en?'en-GB':'nl-NL');
  if(style?.punctuation==='minimal')result=result.replace(/\.\s+([\p{L}])/gu,(_,letter:string)=>`, ${letter.toLowerCase()}`).replace(/\.$/,'').replace(/; /g,', ');
  // A few authors explicitly use this shorthand. Never insert fake spelling
  // errors or change everyone's voice to the same casual register.
  if(!en&&style?.fragments&&style.casualExpressions?.nl?.some(line=>/\bff\b/.test(line)))result=result.replace(/\beven\b/g,'ff');
  return result;
}
function candidates(plan:NpcConversationPlan,step:number,profile:NpcProfile,en:boolean):NpcTextCandidate[]{return [{text:styleNpcConversationText(profile,plan.turns[step],en),family:`conversation:${plan.topic}:${step}`}];}
export function npcConversationCandidates(plan:NpcConversationPlan,step:number,profile:NpcProfile,en:boolean){return candidates(plan,step,profile,en);}
export function npcConversationPlans(a:NpcProfile,b:NpcProfile,en:boolean,random:()=>number):NpcConversationPlan[]{
  const interests=[...a.interests,...b.interests].join(' ');
  return topics.map(topic=>({topic,score:(topic.interests.test(interests)?2:0)+random()})).sort((x,y)=>y.score-x.score).map(({topic})=>({topic:topic.id,turns:topic[en?'en':'nl']}));
}
// Ordinary NPC posts only receive a follow-up when their actual content is
// understood. Unknown statements stay unanswered rather than attracting quotes.
export function npcConversationReplyPlan(source:string,en:boolean):NpcConversationPlan|null {
  const lower=source.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'');
  let topic:string|undefined;
  // A hobby route, marathon finish or part of a word is not a dart event.
  // Ambiguous cross-topic posts stay unanswered instead of acquiring a score.
  const otherSubject=/\b(?:voetbal|football|soccer|fietsen|fietsroute|fietstocht|cycling|wandeling|wandelroute|wandelen|hiking|walk|walking|recept(?:en)?|koken|cooking|recipe(?:s)?|marathon|hardlopen|running|finishlijn|legday|legwork|overleg|legend(?:s)?|legenda|colleague(?:s)?|collega(?:s)?|muziek|music|songs?|gitaar|guitar|drumsolo|espresso|koffie|coffee|webshop|shopping|supermarkt|winkelmand|hotel|tennis|badminton|wielrennen)\b/;
  const declines=/\b(?:geen zin|niet spelen|no game|not playing|don['’]?t want|do not want)\b/;
  if(declines.test(lower))return null;
  if(/\b(?:bordspel(?:len)?|board[ -]?games?)\b/.test(lower))topic='boardgame-choice';
  else if(otherSubject.test(lower))return null;
  else {
    const dartWords=/\b(?:darts?|dartbord|dartboard|bullseye|trebles?|triples?|uitgooien|uitgooi|double[ -]out)\b/.test(lower);
    const specificDouble=/\b(?:dubbel|double)\s*(?:[1-9]|1\d|20)\b|\btops\b/.test(lower);
    const doubleChoice=/\b(?:dubbels?|doubles?)\b/.test(lower)&&/\b(?:kies|kiest|kiezen|gekozen|choose|choosing|prefer|voorkeur|favoriet(?:e)?|favourite|favorite|welke|which)\b/.test(lower);
    const dartAnchor=dartWords||specificDouble||doubleChoice;
    const finishWords=/\b(?:dubbels?|doubles?|checkouts?|uitgooien|uitgooi|finishes|finish|finishroutes?|routes?)\b/.test(lower);
    const practiceWords=/\b(?:oefenen|oefenpotje|oefenpartij|oefenpartijen|oefenwedstrijd|practice|practise|practising|practicing)\b/.test(lower);
    const fullDartPractice=/\b(?:oefenpotje|oefenpartij|oefenpartijen|oefenwedstrijd)\b|\b(?:practice|practise)\s+(?:a\s+)?(?:whole\s+)?(?:leg|doubles?)\b/.test(lower);
    const formatWords=/\b(?:potje|partij|partijen|wedstrijd|wedstrijden|revanche|match|matches|rematch|legs?)\b/.test(lower);
    const namedFormat=/\bbest[ -]of[ -](?:three|five|seven|3|5|7)\b/.test(lower);
    if(practiceWords&&(dartAnchor||fullDartPractice))topic='practice-chat';
    else if(finishWords&&dartAnchor)topic='finish-chat';
    else if(namedFormat||(formatWords&&dartWords))topic='format-chat';
    // This is a room-pace preference, not proof of a game or previous throw.
    else if(/\b(?:rustig(?:e)? tempo|steady pace|no rush|geen haast|take your time|op je gemak)\b/.test(lower))topic='pace-chat';
  }
  if(!topic)return null;
  const turns:Record<string,{nl:NpcConversationPlan['turns'];en:NpcConversationPlan['turns']}>= {
    'finish-chat':{nl:[source, "Bij een finish, welke dubbel kies jij het liefst?", "Meestal 16. Na een misser naar binnen blijft dubbel acht over.", "Ja, tenzij die buurman zich ermee bemoeit.", "Dan wordt het toch weer rekenen."],en:[source, "For a checkout, which double do you like best?", "Usually 16. An inside miss still leaves double eight.", "Yeah, unless the neighbouring number gets involved.", "Then it’s back to counting anyway."]},
    'pace-chat':{nl:[source, "Ja, rustig tempo. Niemand hoeft hier haast te maken.", "Even lezen voordat ik antwoord vind ik ook prettig.", "Een gesprek mag best af en toe stilvallen.", "Precies, niet elk moment hoeft gevuld."],en:[source, "Yeah, steady pace. No need to rush the conversation.", "I prefer a moment to read before answering too.", "A conversation can have a quiet moment.", "Exactly. Not every gap needs filling."]},
    'practice-chat':{nl:[source, "Als oefenvorm: liever een hele leg of alleen de dubbels?", "Een hele oefenleg heeft mijn voorkeur. Dan hoef ik niet op DP te letten.", "Daar zou een andere route uitproberen goed bij passen.", "Ja, als oefenidee lijkt dat me leuk."],en:[source, "As a practice format, a whole leg or just the doubles?", "I prefer a full practice leg, without thinking about DP.", "Trying a different route could fit that kind of practice.", "Yes, that sounds like an enjoyable practice idea."]},
    'format-chat':{nl:[source, "Welk kort format heeft jouw voorkeur?", "Best of three zou mijn keuze zijn. Niet meteen een lange afspraak.", "En liever vaste instellingen, of juist afwisselen?", "Vaste instellingen geven mij wat rust."],en:[source, "Which short format would you prefer?", "Best of three would be my choice, without a long commitment.", "Would you prefer familiar settings or more variety?", "Familiar settings feel calmer to me."]},
  };
  if(topic==='boardgame-choice'){const found=topics.find(t=>t.id===topic)!;return {topic:`reply-${topic}`,turns:[source,...found[en?'en':'nl'].slice(1)] as NpcConversationPlan['turns']};}
  return {topic,turns:turns[topic][en?'en':'nl']};
}
