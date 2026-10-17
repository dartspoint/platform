-- expand-only
alter table private.privacy_requests add column locale text check(locale in ('nl','en'));
alter table private.privacy_mail add column locale text check(locale in ('nl','en'));
alter table private.support_topics add column name_en text,add column description_en text;
alter table private.support_templates add column name_en text,add column body_en text;
-- Optional translations, never an inferred preference or an acceptance backfill.
update private.support_topics set name_en='Tournaments and divisions',description_en='Questions about tournaments and divisions.' where id='tournaments' and name='Toernooien en divisies' and name_en is null;
update private.support_topics set name_en='Chat and conduct',description_en='Report unwanted behaviour confidentially.' where id='chat' and name='Chat en gedrag' and name_en is null;
update private.support_topics set name_en='Match and score',description_en='Questions about a match or score.' where id='match' and name='Wedstrijd en score' and name_en is null;
update private.support_topics set name_en='Ban or restriction and appeal',description_en='Appeal against a ban or restriction.' where id='appeal' and name='Ban of beperking en bezwaar' and name_en is null;
update private.support_topics set name_en='Account and sign-in',description_en='Help with signing in and account security.' where id='account' and name='Account en aanmelden' and name_en is null;
update private.support_topics set name_en='Privacy and personal data',description_en='Access, copy, correction, deletion, objection or restriction.' where id='privacy' and name='Privacy en gegevensverzoeken' and name_en is null;
update private.support_topics set name_en='Technical problem',description_en='Report a technical problem.' where id='technical' and name='Technisch probleem' and name_en is null;
update private.support_topics set name_en='Idea or general question',description_en='An idea or another question.' where id='general' and name='Idee of algemene vraag' and name_en is null;
update private.support_topics set name_en='Complaint about a team member',description_en='Confidential review by another authorised staff member.' where id='complaint' and name='Klacht over een teamlid' and name_en is null;
update private.support_topics set name_en='Report unlawful content',description_en='A report is recorded immediately. Support is not an emergency service.' where id='illegal' and name='Onrechtmatige inhoud melden' and name_en is null;
update private.support_topics set name_en='Incoming email',description_en='Restricted review of received email.' where id='mail-triage' and name='Inkomende e-mail' and name_en is null;
