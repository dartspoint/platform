-- expand-only. Proposed texts are INTERNAL DRAFTS until explicit publication.
create table private.legal_versions (
 id uuid primary key default gen_random_uuid(), document_key text not null check(document_key in ('terms','privacy','guide')),
 title text not null, version text not null, language text not null default 'nl' check(language='nl'), markdown text not null check(length(markdown) between 50 and 100000),
 summary text not null, material boolean not null default false, requires_acceptance boolean not null default false,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(document_key,version),
 check(document_key='terms' or not requires_acceptance)
);
create table private.legal_publications (
 version_id uuid primary key references private.legal_versions(id), published_by uuid not null references public.profiles(id), published_at timestamptz not null default now(),
 effective_at timestamptz not null, exception_reason text, reason text not null
);
create table private.legal_publishers(user_id uuid primary key references public.profiles(id), granted_by uuid not null references public.profiles(id), granted_at timestamptz not null default now(), reason text not null, revoked_at timestamptz);
create table private.legal_company_versions(id uuid primary key default gen_random_uuid(),data jsonb not null,created_by uuid references public.profiles(id),created_at timestamptz not null default now());
insert into private.legal_company_versions(data) values('{"name":"DG Webservices","address":"Markenseplein 1","postalCode":"2583 KR","city":"Den Haag","chamberOfCommerce":"88135713","email":"info@dgwebservices.nl","supportEmail":"support@dartspoint.nl"}');
create table private.legal_rollout_checks(environment text not null, check_key text not null, verified_by uuid not null references public.profiles(id), verified_at timestamptz not null default now(), evidence text not null, primary key(environment,check_key));
create table private.legal_acceptances(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),terms_version_id uuid not null references private.legal_versions(id),
 privacy_version_id uuid not null references private.legal_versions(id),age16_confirmed boolean not null check(age16_confirmed),accepted_at timestamptz not null default now(),
 privacy_informed_at timestamptz not null default now(),unique(user_id,terms_version_id,privacy_version_id)
);
create index legal_acceptance_user on private.legal_acceptances(user_id,accepted_at desc);
create function private.legal_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'legal evidence is immutable' using errcode='23514'; end $$;
create trigger immutable_legal_version before update or delete on private.legal_versions for each row execute function private.legal_immutable();
create trigger immutable_legal_publication before update or delete on private.legal_publications for each row execute function private.legal_immutable();
create trigger immutable_legal_company before update or delete on private.legal_company_versions for each row execute function private.legal_immutable();
create trigger immutable_legal_acceptance before update on private.legal_acceptances for each row execute function private.legal_immutable();
revoke all on function private.legal_immutable() from public,anon,authenticated;
revoke all on private.legal_versions,private.legal_publications,private.legal_publishers,private.legal_rollout_checks,private.legal_acceptances,private.legal_company_versions from public,anon,authenticated;
grant select,insert on private.legal_company_versions to dartspoint_app;
grant select,insert on private.legal_versions,private.legal_publications to dartspoint_app;
grant select,insert,update on private.legal_publishers,private.legal_rollout_checks to dartspoint_app;
grant select,insert,delete on private.legal_acceptances to dartspoint_app;
-- Enforce admission at Auth insertion too: direct OAuth requests cannot bypass it.
-- The transaction shares the existing settings/admission lock. Existing identities
-- and sign-ins never insert auth.users and therefore remain available.
create function private.registration_admission_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.admission_lock where id=1 for share;
 if exists(select 1 from private.system_settings where key='settings' and data->'platform'->>'registrationOpen'='false') then
  raise exception 'Nieuwe registraties zijn tijdelijk gesloten.' using errcode='P0001';
 end if;
 return new;
end $$;
revoke all on function private.registration_admission_trigger() from public,anon,authenticated,dartspoint_app;
create trigger dartspoint_registration_admission before insert on auth.users for each row execute function private.registration_admission_trigger();

insert into private.legal_versions(document_key,title,version,markdown,summary,material,requires_acceptance) values('terms','Algemene voorwaarden','2.0',$legaltext$# Algemene voorwaarden DartsPoint
Versie 2.0 • 15 oktober 2026

## 1 DartsPoint en deze voorwaarden
DartsPoint is ontwikkeld en wordt aangeboden door DG Webservices, Markenseplein 1, 2583 KR Den Haag, KvK 88135713. Je bereikt ons via [DartsPoint Support](https://dartspoint.nl/support) en support@dartspoint.nl. Onze bedrijfs- en contactgegevens staan op de [contactpagina](https://dartspoint.nl/contact).

Deze voorwaarden gelden voor het gebruik van DartsPoint, waaronder spelen, oefenen, chatten en deelnemen aan toernooien of divisies. Bij registratie kun je de voorwaarden lezen en bewaren. Je sluit de gebruiksovereenkomst door ze te aanvaarden en je registratie af te ronden.

DartsPoint is gratis te gebruiken. DP-punten, rankings en badges hebben geen geldwaarde en zijn niet inwisselbaar voor geld. Als wij later betaalde functies aanbieden, krijg je vooraf afzonderlijke informatie over prijs en voorwaarden. Zonder jouw bestelling ontstaat geen betalingsverplichting.

## 2 Je account
Je kunt een account aanmaken vanaf 16 jaar. Ben je minderjarig, zorg dan voor toestemming van je ouder of wettelijke vertegenwoordiger voor zover de wet dat vereist. Gebruik een e-mailadres waarover je zelf beschikt en kies een toegestane spelersnaam. Je spelersnaam is zichtbaar voor andere gebruikers; gebruik bij voorkeur geen gevoelige persoonlijke informatie.

Je kunt inloggen met een e-mailcode of met Google. Houd je mailbox en inlogmiddelen veilig en deel je account of inlogcode niet. Meld vermoedelijk misbruik via support. Je mag geen account gebruiken om je voor iemand anders uit te geven, een maatregel te omzeilen of de competitie te manipuleren.

## 3 Eerlijk spelen en respectvol omgaan
Speel volgens de getoonde spelregels. Cheats, bots, scripts, gemanipuleerde spelsoftware, misbruik van fouten, opzettelijk afgesproken uitslagen en oneerlijke beïnvloeding van ratings zijn niet toegestaan. Meld een fout zonder deze verder uit te buiten.

Bedreiging, intimidatie, discriminatie, doxing, seksuele uitbuiting, fraude, spam en illegale inhoud zijn verboden. Plaats geen persoonsgegevens van anderen zonder geldige reden en deel alleen materiaal waarvoor je de benodigde rechten hebt. Deze regels gelden ook voor privéberichten, gebruikersnamen en supporttickets.

## 4 Wedstrijden en evenementen
De gekozen wedstrijdinstellingen bepalen onder meer startscore, dubbel-in, dubbel-uit en het aantal legs of sets. Controleer de instellingen voordat je een uitnodiging aanvaardt. Bij een toernooi of divisie gelden daarnaast de vooraf getoonde deelname-, planning- en check-inregels.

De spelserver bepaalt worpen, scores en uitslagen. Bij aantoonbare fouten of manipulatie kunnen wij resultaten onderzoeken en gemotiveerd corrigeren. Een verbindingsprobleem of storing geeft niet automatisch recht op winst, herstel van een wedstrijd of vervangende DP-punten. Dwingende wettelijke rechten blijven gelden.

Wij kunnen een evenement aanpassen of annuleren als daarvoor een redelijke reden bestaat, zoals onvoldoende deelnemers, een storing of een veiligheidsprobleem. We informeren deelnemers zo tijdig mogelijk. Een VIP-status of badge geeft alleen de aangekondigde mogelijkheden en geen recht op een gunstigere scoreberekening.

## 5 Moderatie en bezwaar
Wij kunnen woord- en spamfilters toepassen en meldingen onderzoeken. Afhankelijk van ernst, gevolgen en herhaling kunnen wij waarschuwen, inhoud verbergen of verwijderen, een naamswijziging verlangen, functies beperken of een account tijdelijk of definitief afsluiten. Bij ernstig of acuut misbruik kunnen wij direct ingrijpen.

Wij leggen een maatregel in beginsel uit met de reden, reikwijdte en duur. Waar informatie niet kan worden gedeeld wegens de rechten van anderen, veiligheid of een wettelijke verplichting, geven wij zoveel mogelijk een begrijpelijke toelichting. Een filterweigering betekent niet vanzelf een permanente ban.

Je kunt gedrag of vermoedelijk onrechtmatige inhoud melden via de meldfunctie of support. Vermeld waar de inhoud staat, wat er is gebeurd en waarom je de melding doet. Ben je het niet eens met een maatregel, kies dan bij support Ban of beperking en bezwaar. Je kunt om menselijke herbeoordeling vragen. Support en privacyverzoeken blijven bereikbaar zonder account en tijdens een schorsing.

## 6 Jouw inhoud en onze software
De rechten op de software, vormgeving, naam en eigen inhoud van DartsPoint liggen bij DG Webservices of haar licentiegevers. Je krijgt een persoonlijk gebruiksrecht zolang je de dienst volgens deze voorwaarden gebruikt. Wettelijk toegestane uitzonderingen blijven gelden.

Je houdt je eigen rechten op berichten en andere inhoud die je plaatst. Je geeft ons de noodzakelijke toestemming om die inhoud op te slaan, te verwerken en te tonen voor de werking, beveiliging en moderatie van DartsPoint. Dit geeft ons geen onbeperkt recht om jouw inhoud voor reclame of andere doelen te gebruiken.

## 7 Privacy en ondersteuning
In de [privacyverklaring](https://dartspoint.nl/privacy) lees je hoe DG Webservices persoonsgegevens verwerkt, wie gegevens kan zien en hoe je je privacyrechten uitoefent. Aanvaarding van deze voorwaarden is geen algemene toestemming voor gegevensverwerking of marketing.

Supportvragen worden als ticket behandeld. Ingelogde spelers ontvangen antwoorden in hun ticketinbox met een melding in DartsPoint en per e-mail. Zonder account ontvang je antwoorden per e-mail en kun je antwoorden naar support@dartspoint.nl. Bevoegde teamleden reageren met hun voornaam.

## 8 Stoppen en account verwijderen
Je kunt op elk moment stoppen en via Account en privacy of support om accountverwijdering vragen. Wij controleren je identiteit op een passende manier. Na bevestiging wordt je account afgesloten en voeren wij de verwijdering uit volgens de privacyverklaring. Beperkte gegevens kunnen nog noodzakelijk zijn voor bijvoorbeeld een lopend geschil of een geldige sanctie; daarover ontvang je uitleg.

Wij kunnen het gebruik beëindigen bij een ernstige of herhaalde overtreding, of als voortzetting redelijkerwijs niet van ons kan worden verlangd. Waar passend krijg je eerst gelegenheid het probleem te herstellen. Na 24 maanden zonder gebruik kunnen wij een account opruimen; je krijgt dan vooraf 30 dagen om het actief te houden.

## 9 Beschikbaarheid en aansprakelijkheid
Wij spannen ons in voor een goed werkende en veilige dienst. Onderhoud, wijzigingen en technische of netwerkproblemen kunnen de beschikbaarheid beperken. Wij garanderen geen ononderbroken verbinding of foutloze werking. Meld een probleem zo snel mogelijk, zodat wij het kunnen onderzoeken en waar mogelijk herstellen.

Voor aansprakelijkheid gelden de wettelijke regels. Deze voorwaarden sluiten geen dwingende consumentenrechten uit en beperken geen aansprakelijkheid die volgens de wet niet mag worden beperkt. Een storing of fout maakt DG Webservices niet zonder verdere beoordeling aansprakelijk voor iedere gestelde schade.

## 10 Wijzigingen en klachten
Wij kunnen de dienst en voorwaarden aanpassen als daarvoor een redelijke aanleiding bestaat, zoals gewijzigde wetgeving, beveiliging of een verandering van functies. We houden rekening met de gevolgen voor gebruikers. Nieuwe voorwaarden werken niet terug in de tijd.

Bij wezenlijke wijzigingen informeren wij je normaal ten minste 30 dagen vooraf, met een samenvatting, de nieuwe tekst en de ingangsdatum. Noodzakelijke wettelijke of beveiligingsaanpassingen kunnen eerder gelden; we leggen dat dan uit. Je kunt het gebruik vóór de wijziging beëindigen. Waar nieuwe aanvaarding vereist is, vragen wij die expliciet. Een kleine tekstcorrectie verandert je rechten niet.

Stuur een klacht via support@dartspoint.nl of het supportformulier. Op de overeenkomst is Nederlands recht van toepassing, met behoud van de dwingende bescherming die volgens het toepasselijke recht voor jou geldt. Een geschil kan worden voorgelegd aan de volgens de wet bevoegde rechter.
$legaltext$,'Eerste versie voor beoordeling op staging; publicatie na controle van de beschreven inrichting.',false,true);

insert into private.legal_versions(document_key,title,version,markdown,summary,material,requires_acceptance) values('privacy','Privacyverklaring','2.0',$legaltext$# Privacyverklaring DartsPoint
Versie 2.0 • 15 oktober 2026

## 1 Wie verantwoordelijk is
DG Webservices, Markenseplein 1, 2583 KR Den Haag, KvK 88135713, ontwikkelt en exploiteert DartsPoint en is verwerkingsverantwoordelijke voor de persoonsgegevens die we voor deze dienst verwerken. Deze verklaring geldt voor bezoekers, spelers, teamleden en personen die contact met ons opnemen.

Voor vragen of privacyverzoeken ga je naar [DartsPoint Support](https://dartspoint.nl/support) of mail je naar support@dartspoint.nl. Onze bedrijfs- en contactgegevens staan op de [contactpagina](https://dartspoint.nl/contact).

## 2 Gegevens en doeleinden
Voor je account verwerken we je e-mailadres, spelersnaam, account-ID, inlog- en sessiegegevens, leeftijdsbevestiging, voorkeuren en vastlegging van de aanvaarde voorwaarden. Voor spelen en de community verwerken we onder meer wedstrijden, worpen, scores, ratings, badges, aanwezigheid, vrienden, uitnodigingen en chatberichten. Dit is nodig om de gebruiksovereenkomst uit te voeren.

We ontvangen de gegevens van jou en door je gebruik van DartsPoint. Gegevens over jou kunnen ook van andere spelers komen, bijvoorbeeld via uitnodigingen, wedstrijdinformatie of meldingen, en van bevoegde teamleden bij de behandeling daarvan.

Als je met Google inlogt, ontvangen we via Google gegevens voor authenticatie, zoals een unieke gebruikersidentificatie, geverifieerd e-mailadres en beschikbare basisprofielgegevens, waaronder naam en afbeelding. Je kiest zelf je openbare DartsPoint-spelersnaam; wij publiceren je Google-naam of profielfoto niet automatisch. We vragen geen toegang tot je Gmail, contacten, bestanden of agenda.

Voor support verwerken we je contactgegevens, vraag, correspondentie, bijlagen, relevante spel- of accountreferenties en de behandeling van je ticket. Voor ondersteuning bij de dienst gebruiken we de overeenkomst als grondslag; voor andere vragen ons gerechtvaardigd belang om contact te beantwoorden. Voor de uitvoering van AVG-rechten geldt een wettelijke verplichting. Van teamleden verwerken we hun rol, voornaam en noodzakelijke beheerregistraties.

Voor beveiliging, misbruikbestrijding en proportionele moderatie verwerken we technische verbindingsgegevens, filtermeldingen, rapportages, noodzakelijk bewijs, maatregelen en auditgegevens. Hiervoor beroepen wij ons op ons gerechtvaardigd belang bij een veilig en eerlijk platform, met afweging van de belangen van betrokkenen. Ook openbare ranglijsten en minimale competitiehistorie ondersteunen ons gerechtvaardigd belang bij een controleerbare competitie.

Noodzakelijke inlog-, ticket-, account- en veiligheidsmails horen bij deze dienstverlening of beveiliging. Vrijwillige updates sturen wij op basis van een afzonderlijke aanmelding; afmelden kan via de aangeboden afmeldmogelijkheid. Voor een wettelijke verplichting of noodzakelijke rechtsvordering kunnen we beperkte gegevens afzonderlijk verwerken.

Je hoeft geen betaalgegevens, volledige geboortedatum of identiteitsbewijs te verstrekken om te spelen. Zonder de noodzakelijke account- en spelgegevens kunnen wij de dienst niet leveren. Deel geen wachtwoorden, inlogcodes of onnodige gevoelige informatie in chat of tickets.

## 3 Wat zichtbaar is en wie toegang heeft
Je spelersnaam, rol, rating en spelprestaties kunnen zichtbaar zijn voor andere spelers en in openbare ranglijsten, toernooien en divisieoverzichten. Die openbare informatie is ook zonder account te bekijken. In kamers kan je aanwezigheid zichtbaar zijn en kan een bericht melden dat je binnenkomt. Je e-mailadres staat niet in het gewone spelersoverzicht.

Kamer- en wedstrijdchat zijn zichtbaar voor deelnemers en andere gebruikers die toegang hebben tot die omgeving. Privéchat wordt niet openbaar getoond. Privéberichten zijn niet end-to-end versleuteld; onze servers verwerken de inhoud voor aflevering en toegepaste filters. Bij een melding kan noodzakelijke berichtinhoud als bewijs worden bewaard en door bevoegde medewerkers worden beoordeeld.

Tickets zijn zichtbaar voor de aanvrager en de teamleden die voor het onderwerp bevoegd zijn. Privacy- en accountverzoeken zijn beperkt tot Platformbeheer. Een medewerker antwoordt met zijn of haar voornaam. Interne notities worden niet in je gewone ticketgesprek getoond; bij een privacyverzoek beoordelen we ook persoonsgegevens in zulke notities volgens de toepasselijke regels.

Scores en ratings worden automatisch berekend. Filters kunnen namen of berichten blokkeren. Bij een betwiste maatregel of relevante spelbeslissing kun je via support om menselijke beoordeling vragen.

## 4 Dienstverleners en doorgifte
Wij gebruiken Hetzner voor hosting, Supabase voor database- en accountvoorzieningen en Cloudflare Turnstile voor botbescherming. E-maildienstverleners verwerken adressen, berichtinhoud en bezorggegevens voor inlog- en supportmail. Google verwerkt gegevens wanneer je kiest voor Google-login; voor zijn eigen dienstverlening geldt ook het [privacybeleid van Google](https://policies.google.com/privacy).

Dienstverleners krijgen alleen toegang die voor hun taak nodig is. Met verwerkers maken wij afspraken over beveiliging, vertrouwelijkheid en gebruik van gegevens. Gegevens kunnen bij internationale dienstverleners ook buiten de Europese Economische Ruimte worden verwerkt. Waar dat gebeurt, gebruiken we een toepasselijk adequaatheidsbesluit of passende waarborgen, zoals Europese standaardcontractbepalingen en waar nodig aanvullende maatregelen. Via support kun je informatie over de toepasselijke waarborgen en een kopie daarvan opvragen, met bescherming van vertrouwelijke gegevens.

We kunnen gegevens verder verstrekken als een wettelijke verplichting dat vereist of dit noodzakelijk is voor een rechtsvordering. We gebruiken je gegevens niet voor andere doelen zonder daarvoor een passende grondslag en de vereiste informatie te bieden.

### Cloudflare Turnstile
Wij gebruiken Cloudflare Turnstile in onzichtbare modus om bots en misbruik tegen te gaan. Cloudflare verwerkt hiervoor technische signalen, zoals je IP-adres, browserinformatie, TLS-kenmerken en de site-identificatie.

Voor het beveiligen van DartsPoint verwerkt Cloudflare deze gegevens namens DG Webservices. Wij baseren dit op ons gerechtvaardigd belang bij beveiliging, met afweging van jouw privacybelangen. Voor verbetering van de botdetectie treedt Cloudflare zelf op als verwerkingsverantwoordelijke. Meer informatie staat in het [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/en-gb/turnstile-privacy-policy/).

## 5 Cookies en lokale opslag
DartsPoint gebruikt functionele cookies en vergelijkbare opslag om je ingelogd te houden en gebruikskeuzes te onthouden. Een sessiecookie verloopt volgens de sessie-instellingen of wordt verwijderd bij uitloggen. Lokale voorkeuren kunnen blijven staan totdat je ze wijzigt of de sitegegevens wist. De installeerbare webapp kan openbare bestanden zoals pictogrammen en stijlbestanden lokaal opslaan; de offlinecache is niet bedoeld voor persoonlijke API-antwoorden of chatgeschiedenis.

Je kunt cookies en sitegegevens verwijderen via je browserinstellingen. Je moet daarna mogelijk opnieuw inloggen en voorkeuren instellen. Voor tracking of andere niet-noodzakelijke technieken die toestemming vereisen, vragen wij vooraf een afzonderlijke keuze. Algemene voorwaarden vervangen die keuze niet.

## 6 Bewaartermijnen
Wij bewaren gegevens zolang ze nodig zijn voor het genoemde doel. De normale maxima staan hieronder. We wissen eerder als de gegevens niet meer nodig zijn of een geldig verwijderverzoek dat vereist.

| Gegevens | Bewaartermijn |
| --- | --- |
| Account, voorkeuren en actuele spelstatistieken | Tijdens gebruik van je account; na 24 maanden inactiviteit volgt een waarschuwing en 30 dagen gelegenheid om het actief te houden |
| Onvoltooide registratie | 30 dagen |
| Kamer- en wedstrijdchat | 90 dagen na het bericht |
| Privéberichten en chatconcepten | Berichten 12 maanden; concepten 7 dagen na laatste wijziging |
| Technische worpgegevens | Maximaal 12 maanden, in beginsel eerder bij accountverwijdering |
| Minimale wedstrijdgegevens na accountverwijdering | Maximaal 24 maanden na de wedstrijd, voor noodzakelijke historie, competitiecontrole en geschillen |
| Gewone tickets en bijlagen | 12 maanden na sluiting |
| Privacyverzoeken | Inhoud en bijlagen 6 maanden na afronding; daarna alleen minimaal afhandelbewijs tot 24 maanden na afronding |
| Moderatiezaken en bezwaar | Maximaal 12 maanden na afronding; voor een actieve sanctie alleen noodzakelijke kerngegevens met halfjaarlijkse beoordeling |
| Technische logs en bezoekgegevens | Maximaal 30 dagen |
| E-mailverwerking | Bezorgmetadata 90 dagen; ruwe ontvangen mail 30 dagen na verwerking in een ticket |
| Tijdelijke gegevenskopieën | 7 dagen na beschikbaarstelling |
| Beheer- en beveiligingsaudit | 12 maanden |
| Bewijs van voorwaardenacceptatie | Accountduur en maximaal 24 maanden daarna, met minimale bewijsgegevens |
| Vrijwillige updates | Tot afmelding; minimaal bewijs van afmelding maximaal 24 maanden |

Onbevestigde gewone gasttickets worden na 7 dagen opgeruimd. Ontvangen privacyverzoeken en juridische meldingen worden afzonderlijk beoordeeld en gaan niet uitsluitend door een ontbrekende mailbevestiging verloren.

Na accountverwijdering verdwijnen je openbare profiel en naamkoppeling. Noodzakelijke wedstrijdgegevens van tegenstanders kunnen beperkt blijven bestaan. Een deelnemerscode of unieke wedstrijdhistorie kan nog herleidbaar zijn; die behandelen we daarom niet automatisch als anonieme gegevens. Werkelijk onomkeerbare totalen zonder individuele koppeling kunnen bewaard blijven.

Als gegevens specifiek nodig blijven voor een lopend geschil, een rechtsvordering, een wettelijke verplichting of een nog noodzakelijke sanctie, bewaren we alleen die gegevens met beperkte toegang en een vastgelegde beoordelingstermijn. Een gehashte e-mail op een sanctielijst blijft daarbij een persoonsgegeven.

Back-ups kunnen tijdelijk nog oudere gegevens bevatten. Deze zijn niet voor dagelijks gebruik beschikbaar en worden uiterlijk 30 dagen na verwijdering uit de actieve systemen vervangen of onbruikbaar gemaakt. Na herstel passen we verwijderingen opnieuw toe voordat gegevens weer beschikbaar komen. Een minimaal herstelregister blijft hoogstens 7 dagen langer beschikbaar om dat te controleren. Voor zelfstandige verwerkingen door Google en Cloudflare gelden hun eigen bewaarbeleid en rechtenprocedures.

## 7 Je rechten en accountverwijdering
Je kunt vragen om inzage, correctie, verwijdering en beperking van verwerking. Waar van toepassing kun je gegevensoverdracht vragen. Tegen verwerking op basis van gerechtvaardigd belang kun je vanwege jouw situatie bezwaar maken; tegen direct marketing kan dat altijd. Toestemming kun je intrekken zonder dat dit de eerdere rechtmatige verwerking verandert.

Kies bij [DartsPoint Support](https://dartspoint.nl/support) Privacy en persoonsgegevens of mail naar support@dartspoint.nl. Wij registreren je verzoek als ticket. Dit kan ook zonder account of tijdens een ban. Een verzoek dat langs een ander aangeboden contactkanaal binnenkomt, leiden wij intern door.

We controleren je identiteit op een passende manier. Stuur niet uit jezelf een identiteitsbewijs. Voor volledige accountverwijdering of een gegevenskopie kan een extra inlog- of mailbevestiging nodig zijn. Heb je geen toegang meer tot je mailbox, dan beoordelen we een passend alternatief.

Na bevestiging van accountverwijdering sluiten we je account af en voeren we de noodzakelijke verwijderhandelingen zonder onnodige vertraging uit. Je krijgt bericht over de afronding en eventuele beperkte gegevens die we met reden nog bewaren. Het sluiten van een chattab, blokkeren van een speler of alleen uitloggen verwijdert niet automatisch je eerdere gegevens.

We reageren op privacyverzoeken in beginsel binnen één maand. Bij noodzakelijke verlenging wegens complexiteit of het aantal verzoeken kan dit maximaal twee maanden langer duren; je hoort de reden binnen de eerste maand. Sommige rechten kennen wettelijke uitzonderingen. Bij een geheel of gedeeltelijk afgewezen verzoek leggen we de reden uit. Je kunt een klacht indienen bij de [Autoriteit Persoonsgegevens](https://autoriteitpersoonsgegevens.nl) en je tot de bevoegde rechter wenden.

## 8 Beveiliging en wijzigingen
We nemen passende beveiligingsmaatregelen, waaronder beveiligde verbindingen, toegangscontrole, verificatie van gevoelige handelingen en beperkte toegang tot tickets en beheerfuncties. Houd ook je eigen mailbox en inlogmiddelen veilig. Meld een vermoedelijk beveiligingsprobleem via support@dartspoint.nl.

DartsPoint is bedoeld voor gebruikers vanaf 16 jaar. We verzamelen voor die controle geen volledige geboortedatum. We houden bij de verwerking rekening met de belangen van minderjarigen.

We passen deze verklaring aan wanneer de dienst of gegevensverwerking verandert. De actuele versie staat op de website. Bij belangrijke wijzigingen informeren we betrokken gebruikers op een passende manier.
$legaltext$,'Eerste versie voor beoordeling op staging; publicatie na controle van de beschreven inrichting.',false,false);

insert into private.legal_versions(document_key,title,version,markdown,summary,material,requires_acceptance) values('guide','Handleiding','2.0',$legaltext$# Handleiding DartsPoint
Voor spelers • Versie 2.0 • 15 oktober 2026

DartsPoint is ontwikkeld door DG Webservices. Je kunt online darten, oefenen, andere spelers ontmoeten en deelnemen aan toernooien en divisies. Deze handleiding helpt je bij aanmelden, spelen en ondersteuning.

## 1 Aanmelden
Open [DartsPoint](https://dartspoint.nl) en kies aanmelden. Je kunt Doorgaan met Google kiezen of met je eigen e-mailadres een inlogcode aanvragen. Voer steeds de nieuwste ontvangen code in en controleer zo nodig je spammap. Deel je code met niemand.

Bij je eerste aanmelding kies je een spelersnaam van 3 tot 20 tekens. Letters, cijfers, een streepje en een laag streepje zijn toegestaan. Bevestig dat je ten minste 16 jaar bent en lees en aanvaard de algemene voorwaarden. Je begint met 1500 DP-punten. Je Google-naam wordt niet automatisch je spelersnaam.

Heb je al een account, gebruik dan hetzelfde geverifieerde e-mailadres. Bij Google met een ander e-mailadres kunnen twee verschillende accounts ontstaan; neem bij twijfel eerst contact op met support. Je eigen spelersnaam, vrienden en punten horen bij je bestaande account.

## 2 Een kamer kiezen
In de lobby zie je de beschikbare kamers en hun bezetting. Een kamer kan vol, besloten of gesloten zijn, of ratingvoorwaarden hebben. Open een kamer die bij je past. Andere spelers kunnen zien dat je binnenkomt.

Op desktop staan het spel en de kamerinhoud links. Rechtsboven staan spelers en vrienden; rechtsonder staan de chats. Op mobiel open je kamer, chat en ladder via de navigatie onderaan. Tijdens een wedstrijd blijft ruimte over om het spel te zien.

## 3 Oefenen en gooien
Ga eerst een kamer binnen en open de oefenruimte. Je kunt vrij gooien of een aangeboden oefenvorm kiezen, zoals dubbels, bull of uitgooien. Oefenen verandert je wedstrijd-DP niet.

Een worp heeft twee stappen: stop eerst de horizontale indicator voor de richting en daarna de verticale indicator voor de hoogte. Gebruik de gooiknop of de spatiebalk. Wanneer je in een tekstveld typt of een dialoog open hebt, dient de spatiebalk niet als vrije werpactie. Wacht op de inslag voordat je verdergaat.

## 4 Een wedstrijd spelen
Open het menu bij een beschikbare speler en nodig die uit. Kies de aangeboden spelinstellingen, zoals 301, 501 of 701, dubbel-in, dubbel-uit, legs of sets en gerankt of casual. De tegenstander kan aanvaarden of weigeren.

Een leg is één spel naar nul; een set bestaat uit meerdere legs. Bij best of 3 wint degene die als eerste twee legs of sets wint, afhankelijk van de instellingen. Per beurt heb je maximaal drie pijlen.

Enkele vakken tellen hun getal, de smalle triple-ring driemaal en de dubbelring tweemaal. De buitenbull telt 25 en de rode bull 50. Bij dubbel-in tellen punten pas na een dubbel. Bij dubbel-uit moet je precies op nul eindigen met een dubbel; ook de rode bull telt als dubbel.

Een te hoge score is een bust. Bij dubbel-uit geldt dat ook als je één punt overhoudt of zonder dubbel op nul eindigt. De score van die beurt wordt volgens de spelregels teruggezet. Het scorebord toont de resterende score en eventuele uitgooitips.

De server bevestigt worpen en scores. Volg bij een verbindingsprobleem de melding om te hervatten. Herhaalde beurtoverschrijding kan verlies betekenen; na drie opeenvolgende beurtoverschrijdingen kan de wedstrijd worden beëindigd. Noteer bij een probleem het wedstrijdnummer voor support.

## 5 DP en ranglijsten
Je begint met 1500 DP. Je rating blijft voorlopig wit tot je ten minste 10 gerankte wedstrijden tegen minstens 5 verschillende tegenstanders hebt gespeeld. Daarna is de zichtbare rating rood onder 1450, geel/amber van 1450 tot en met 1549 en groen vanaf 1550.

Gewonnen en verloren gerankte wedstrijden kunnen je rating veranderen. De sterkte van je tegenstander telt mee. De kleur of badge bij een spelersnaam kan een rol aangeven en staat los van de DP-rating. Teamlid zijn geeft geen voordeel bij het gooien of scoren.

## 6 Chat en vrienden
Gebruik de tabs voor wedstrijdchat, kamerchat en privégesprekken. Controleer vóór verzending in welk gesprek je zit. Via het spelersmenu kun je een profiel bekijken, iemand toevoegen als vriend, een privégesprek beginnen of iemand dempen, blokkeren of melden.

Dempen verbergt berichten voor jou. Blokkeren beperkt contact en kan een vriendschap of open verzoek beëindigen. Een chat sluiten, iemand blokkeren of uitloggen wist eerdere berichten niet automatisch. Onder Instellingen bepaal je wie een nieuw privégesprek mag beginnen.

Meld ongewenst gedrag met een duidelijke reden en alleen noodzakelijke context. Deel geen inlogcodes of gevoelige gegevens. Een melding kan noodzakelijke berichtinhoud aan bevoegde medewerkers beschikbaar maken.

## 7 Toernooien en divisies
Open een gepubliceerd toernooi via de lobby of het Clubhuis. Lees deelnamevoorwaarden, speeltijden en check-inregels voordat je inschrijft. Een inschrijving alleen betekent niet altijd dat je al bent ingecheckt. Houd meldingen over je wedstrijden in de gaten.

Divisies hebben een seizoen, indeling, programma en stand. Bekijk welke wedstrijd voor je klaarstaat en binnen welke periode je moet spelen. Heb je een vraag over deelname of planning, maak dan een ticket met onderwerp Toernooien en divisies.

## 8 Mijn tickets
Open Help en tickets of ga in het Clubhuis naar Mijn tickets. Kies Nieuw ticket, selecteer het onderwerp en beschrijf je vraag. Voeg waar relevant een wedstrijdnummer, kamer of toernooi toe. Een schermafbeelding of PDF kan helpen; voeg geen wachtwoord, inlogcode of identiteitsbewijs toe.

Je ziet je ticketnummer, status en de reacties in je eigen inbox. Een medewerker antwoordt met zijn of haar voornaam. Bij een nieuwe reactie krijg je een melding in DartsPoint en per e-mail. Je kunt antwoorden in hetzelfde ticket; een reactie op de ticketmail naar support@dartspoint.nl kan ook worden verwerkt.

Ben je uitgelogd of lukt inloggen niet, open dan [DartsPoint Support](https://dartspoint.nl/support). Vul je voornaam, e-mailadres en vraag in en bevestig zo nodig je adres. Je hoeft geen spelersaccount aan te maken. Antwoorden ontvang je per e-mail; beantwoorden kan naar support@dartspoint.nl.

Een ban verhindert niet dat je support bereikt. Kies Ban of beperking en bezwaar om een maatregel te laten beoordelen. Een privacyvraag kies je onder Privacy en persoonsgegevens. Rechtstreeks mailen naar support@dartspoint.nl is ook mogelijk; je bericht wordt als ticket behandeld.

## 9 Account en privacy
Onder Account en privacy kun je gegevens opvragen, laten corrigeren, verwijdering vragen of bezwaar maken tegen een verwerking. De aanvraag wordt een afgeschermd ticket voor Platformbeheer. Voor gevoelige acties vragen we een extra bevestiging om je account te beschermen.

Wil je stoppen, kies Account verwijderen. Lees de uitleg en bevestig de aanvraag. Daarna verlies je toegang tot spelen en chatten en volgt de verwijdering. Je ontvangt per e-mail bericht over de afronding en eventuele beperkte gegevens die met reden nog bewaard blijven. Een gegevenskopie aanvragen vóór verwijdering is optioneel.

Je Google-account zelf wordt niet verwijderd wanneer je je DartsPoint-account verwijdert. Verwijderde spelaccounts worden niet automatisch hersteld door opnieuw met Google of e-mail in te loggen. Meer informatie staat in de [privacyverklaring](https://dartspoint.nl/privacy).

## 10 Instellingen en hulp
In het Clubhuis vind je je wedstrijden, records, badges en instellingen. Pas geluid, trillingen, de plaats van de gooiknop en beweging aan naar voorkeur. Rust tijdens jouw beurt stelt de zichtbare binnenkomst van chatberichten uit; je kunt ze daarna bekijken.

Op ondersteunde browsers kun je DartsPoint aan je startscherm toevoegen. Het blijft een online dienst: voor aanmelden, chatten en live spelen heb je internet nodig. Log uit op een gedeeld apparaat.

| Probleem | Wat je kunt doen |
| --- | --- |
| Geen inlogcode | Controleer adres en spam, wacht de aangegeven tijd af en vraag één nieuwe code |
| Google-aanmelding geannuleerd | Probeer opnieuw of gebruik de e-mailcode van hetzelfde account |
| Kamer opent niet | Controleer bezetting, toegang en ratingvoorwaarden |
| Oefenen opent niet | Ga eerst een toegankelijke kamer binnen |
| Bericht geweigerd | Lees de filtermelding of wacht de aangegeven tijd |
| Wedstrijdprobleem | Volg hervatten en vermeld het wedstrijdnummer in een supportticket |
| Geen ticketmail | Controleer spam; ingelogd staat de reactie ook in Mijn tickets |

Voor verdere hulp gebruik je [DartsPoint Support](https://dartspoint.nl/support) of support@dartspoint.nl.
$legaltext$,'Eerste versie voor beoordeling op staging; publicatie na controle van de beschreven inrichting.',false,false);
