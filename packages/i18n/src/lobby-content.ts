import type {LobbyLayout} from '../../contracts/src/lobby';
import {contentCopy,contentTranslationCurrent} from '../../contracts/src/content-translations';
import type {Locale} from './locale';
/** Fixed platform defaults; custom prose needs an explicitly linked edition. */
const defaults:Record<string,string>={
 'Goed dat je er bent.':'Good to have you here.','JOUW KAMER. JOUW CLUB.':'YOUR ROOM. YOUR CLUB.','Van het team':'From the team','DartsPoint blijft groeien.':'DartsPoint keeps growing.','De laatste toevoegingen, samen met de community.':'The latest additions, together with the community.','Al zin in een potje?':'Fancy a game?','Vind je volgende tegenstander in deze kamer.':'Find your next opponent in this room.','Zoek een speler':'Find a player','Vijf dubbels.\nEén lekker gevoel.':'Five doubles.\nOne great feeling.','Oefen tussen twee potjes door.':'Practise between games.','Pak je pijlen':'Pick up your darts','Een moment uit de community':'A community moment','Een mooie worp, een mijlpaal of een verhaal uit de kamer.':'A great throw, a milestone or a story from the room.','Van het prikbord':'From the noticeboard','Nieuws & updates':'News & updates','Jouw stem telt.':'Your vote counts.','Jouw plek op de ladder.':'Your place on the ladder.','Een vaste divisie en nieuwe tegenstanders.':'A regular division and new opponents.','Bekijk de divisies':'View the divisions',
};
export function localiseLobbyLayout(layout:LobbyLayout,locale:Locale):LobbyLayout {
 if(locale==='nl')return layout;
 const convert=(item:any)=>{const source=contentCopy(item),edition=contentTranslationCurrent(item)?item.translations.en.text:null;const text=edition??Object.fromEntries(Object.entries(source).map(([key,value])=>[key,typeof value==='string'?(defaults[value]??value):value]));const missing=!edition&&Object.values(source).some(value=>typeof value==='string'&&!!value&&!Object.hasOwn(defaults,value));return {text,missing};};
 const headline=convert(layout);
 return {...layout,headline:headline.text.headline+(headline.missing?' · Original text':''),eyebrow:headline.text.eyebrow,widgets:layout.widgets.map(widget=>{const {text,missing}=convert(widget);return {...widget,title:text.title+(missing&&text.title?' · Original text':''),description:text.description,settings:{...widget.settings,ctaLabel:text.ctaLabel,scoreLabel:text.scoreLabel,...(widget.type==='poll'?{pollOptions:text.pollOptions}:{})}};}),articles:layout.articles.map(article=>{const {text,missing}=convert(article);return {...article,...text,title:text.title+(missing?' · Original text':'')};})};
}
