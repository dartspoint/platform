# Publiekslaap — correctie 1.2

## Gedrag in de lokale referentie
De geselecteerde kamer krijgt het ingestelde aantal gesimuleerde menselijke bezoekers. Alleen die kamer kan nieuwe NPC-activiteit krijgen. Standaard room counters, persona's en NPC-onlinevlaggen zijn geen publiek. Bij nul bezoekers stopt de regisseur volledig: geen simulatietijd, aanwezigheid, berichten, uitnodigingen, nieuwe games of NPC–NPC-worpen/DP-mutaties. Een eenmalige overgang zet vrije NPC's rustig offline en maakt uitnodigingen ongeldig.

Alle dialoogpaden controleren de aanwezigheid ook onder de laatste publicatielock. De bestaande lifecycle-epochs maken een oude reactie definitief ongeldig bij vertrek en terugkeer. Actieve onderlinge partijen bewaren hun exacte stand en hervatten alleen wanneer hun kamer weer publiek heeft; geen inhaalbeurten. Wakker worden plant nieuwe acties in de toekomst. Reset en herladen verzinnen geen bezoekers. Een reeds gestarte menselijke partij kan volgens bestaande spelafhandeling eenmalig worden afgerond.

De UI toont Slaapstand en bevat bij Regisseur de knoppen Simuleer lege kamer en Eerste bezoeker. Ook handmatige scenario's en directe module-aanroepen kunnen de afwezigheidscontrole niet omzeilen.

## Productieoverdracht
Sectie 7.1 van de hoofdprompt is leidend. De browserregelaar is uitsluitend een demonstratie en mag geen productieautoriteit worden. Gebruik unieke geauthenticeerde menselijke actoren met echte native kamerpresence, geldige roomsubscription/heartbeat, expiry en publieksepochs. Doe de controle vóór iedere nieuwe providercall én bij publicatie. Stop betaalde achtergrondgeneratie bij afwezigheid. Best-effort annulering geeft geen garantie op terugbetaling van al verwerkte tokens. Native human–NPC-timeouts en herstel blijven de bestaande spelautoriteit volgen.

## Verificatie
16 nieuwe slaapstandregressies slagen (waaronder 70 combinaties van publieks- en planningsinstellingen). Samen met director 8, tekst 20, gesprekken 19 en grounding 30 zijn dit 93 controles. TypeScript en Sites-build zijn geslaagd. Geen live OpenAI-calls; geen beschikbare visuele browser-QA. Native-repositorytests zijn voor deze referentie niet uitgevoerd.
