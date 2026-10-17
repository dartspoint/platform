-- expand-only
-- Translations retain the original legal version ID and effective date.
create table private.legal_translations (
 id uuid primary key default gen_random_uuid(),source_version_id uuid not null references private.legal_versions(id),
 language text not null check(language='en'),revision text not null check(length(revision) between 1 and 40),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),title text not null,summary text not null,
 markdown text not null check(length(markdown) between 50 and 100000),created_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),unique(source_version_id,language,revision)
);
create table private.legal_translation_publications (
 translation_id uuid primary key references private.legal_translations(id),published_at timestamptz not null default now(),
 published_by uuid references public.profiles(id),reason text not null
);
create index legal_translations_source on private.legal_translations(source_version_id,language,created_at desc);
create trigger immutable_legal_translation before update or delete on private.legal_translations for each row execute function private.legal_immutable();
create trigger immutable_legal_translation_publication before update or delete on private.legal_translation_publications for each row execute function private.legal_immutable();
revoke all on private.legal_translations,private.legal_translation_publications from public,anon,authenticated;
grant select,insert on private.legal_translations,private.legal_translation_publications to dartspoint_app;
alter table private.legal_acceptances add column language text check(language in ('nl','en')),
 add column terms_translation_id uuid references private.legal_translations(id),add column privacy_translation_id uuid references private.legal_translations(id);
-- Legacy acceptance language remains NULL. Existing immutable evidence is untouched.

-- Verified against the published Dutch version 2.0. Only exact matching sources are linked.
with inserted as (
 insert into private.legal_translations(source_version_id,language,revision,source_hash,title,summary,markdown)
 select v.id,'en','en-1','b523df2bd816043c0b9f42ffb8bae3db05108174573e5b5d8a077415fcc3a8dc','DartsPoint Terms and Conditions','English translation of the same substantive version; no new acceptance required.','# DartsPoint Terms and Conditions
Version 2.0 • 15 October 2026

## 1 DartsPoint and these terms
DartsPoint is developed and provided by DG Webservices, Markenseplein 1, 2583 KR Den Haag, Chamber of Commerce number 88135713. You can reach us through [DartsPoint Support](/en/support) and support@dartspoint.nl. Our company and contact details are on the [contact page](/en/contact).

These terms apply to the use of DartsPoint, including playing, practising, chatting and participating in tournaments or divisions. You can read and save the terms during registration. You enter into the agreement for use by accepting them and completing your registration.

DartsPoint is free to use. DP-punten, rankings and badges have no monetary value and cannot be exchanged for money. If we offer paid features in the future, you will receive separate information about prices and terms in advance. No payment obligation arises without your order.

## 2 Your account
You can create an account from the age of 16. If you are a minor, obtain permission from your parent or legal guardian where required by law. Use an email address you control and choose a permitted player name. Your player name is visible to other users; preferably do not include sensitive personal information.

You can sign in with an email code or Google. Keep your mailbox and sign-in credentials secure and do not share your account or sign-in code. Report suspected misuse through support. You may not use an account to impersonate someone else, evade a measure or manipulate the competition.

## 3 Fair play and respectful conduct
Play according to the displayed rules. Cheats, bots, scripts, manipulated game software, exploitation of bugs, deliberately agreed results and unfair manipulation of ratings are not permitted. Report a bug without exploiting it further.

Threats, harassment, discrimination, doxing, sexual exploitation, fraud, spam and illegal content are prohibited. Do not post other people’s personal data without a valid reason, and share only material for which you have the necessary rights. These rules also apply to private messages, usernames and support tickets.

## 4 Matches and events
The selected match settings determine matters including the starting score, double-in, double-out and the number of legs or sets. Check the settings before accepting an invitation. Tournaments and divisions also have participation, scheduling and check-in rules displayed in advance.

The game server determines throws, scores and results. In the event of demonstrable errors or manipulation, we may investigate results and correct them with reasons. A connection problem or outage does not automatically entitle you to a win, restoration of a match or replacement DP-punten. Mandatory statutory rights continue to apply.

We may change or cancel an event for a reasonable reason, such as insufficient participants, an outage or a security issue. We inform participants as promptly as possible. VIP status or a badge provides only the announced features and no entitlement to more favourable scoring.

## 5 Moderation and appeals
We may apply word and spam filters and investigate reports. Depending on severity, consequences and repetition, we may issue warnings, hide or remove content, require a name change, restrict features or suspend or permanently close an account. We may act immediately in cases of serious or urgent misuse.

As a rule, we explain a measure’s reason, scope and duration. Where information cannot be shared because of other people’s rights, security or a legal obligation, we provide an understandable explanation as far as possible. A filter rejection does not automatically mean a permanent ban.

You can report conduct or suspected unlawful content through the reporting feature or support. State where the content is, what happened and why you are reporting it. If you disagree with a measure, choose Ban or restriction and appeal in support. You can request a human review. Support and privacy requests remain accessible without an account and during suspension.

## 6 Your content and our software
Rights to DartsPoint’s software, design, name and own content belong to DG Webservices or its licensors. You receive a personal right to use the service while you use it according to these terms. Exceptions permitted by law continue to apply.

You retain your own rights to messages and other content you post. You give us the permission necessary to store, process and display that content for DartsPoint’s operation, security and moderation. This does not give us an unrestricted right to use your content for advertising or other purposes.

## 7 Privacy and support
The [privacy notice](/en/privacy) explains how DG Webservices processes personal data, who can see it and how you can exercise your privacy rights. Acceptance of these terms does not constitute general consent to data processing or marketing.

Support questions are handled as tickets. Signed-in players receive replies in their ticket inbox, with a notification in DartsPoint and by email. Without an account, you receive replies by email and can reply to support@dartspoint.nl. Authorised team members reply using their first name.

## 8 Stopping and deleting your account
You can stop at any time and request account deletion through Account and privacy or support. We verify your identity appropriately. After confirmation, your account is closed and we carry out deletion according to the privacy notice. Limited data may still be necessary, for example for an ongoing dispute or a valid sanction; you will receive an explanation.

We may terminate use for a serious or repeated breach, or where continuation cannot reasonably be required of us. Where appropriate, you first have an opportunity to remedy the problem. After 24 months without use, we may remove an account; you will receive 30 days’ advance notice to keep it active.

## 9 Availability and liability
We make efforts to provide a functioning and secure service. Maintenance, changes and technical or network problems may limit availability. We do not guarantee an uninterrupted connection or error-free operation. Report a problem as soon as possible so that we can investigate and, where possible, resolve it.

Statutory rules govern liability. These terms do not exclude mandatory consumer rights or limit liability that cannot legally be limited. An outage or error does not, without further assessment, make DG Webservices liable for every alleged loss.

## 10 Changes and complaints
We may change the service and terms for a reasonable reason, such as changes in legislation, security or features. We take the consequences for users into account. New terms do not apply retrospectively.

For material changes, we normally inform you at least 30 days in advance, with a summary, the new text and the effective date. Necessary legal or security changes may take effect sooner; we will explain this. You can stop using the service before the change. Where renewed acceptance is required, we ask for it explicitly. A minor textual correction does not change your rights.

Send a complaint to support@dartspoint.nl or through the support form. The agreement is governed by Dutch law, preserving the mandatory protection available to you under the applicable law. A dispute may be submitted to the court competent under the law.'
 from private.legal_versions v where v.document_key='terms' and v.version='2.0' and encode(sha256(convert_to(btrim(v.markdown),'UTF8')),'hex')='b523df2bd816043c0b9f42ffb8bae3db05108174573e5b5d8a077415fcc3a8dc'
 on conflict do nothing returning id,source_version_id
)
insert into private.legal_translation_publications(translation_id,reason)
 select i.id,'Translation checked against the published Dutch source, revision en-1; no legal approval claimed.'
 from inserted i join private.legal_publications p on p.version_id=i.source_version_id;

-- Verified against the published Dutch version 2.0. Only exact matching sources are linked.
with inserted as (
 insert into private.legal_translations(source_version_id,language,revision,source_hash,title,summary,markdown)
 select v.id,'en','en-1','f74fe800515a1a1a75bf47e7e11af409655e1155c19c90d28baf5c5574bcd129','DartsPoint Privacy Notice','English translation of the same substantive version; no new acceptance required.','# DartsPoint Privacy Notice
Version 2.0 • 15 October 2026

## 1 Who is responsible
DG Webservices, Markenseplein 1, 2583 KR Den Haag, Chamber of Commerce number 88135713, develops and operates DartsPoint and is the controller for the personal data we process for this service. This notice applies to visitors, players, team members and people who contact us.

For questions or privacy requests, visit [DartsPoint Support](/en/support) or email support@dartspoint.nl. Our company and contact details are on the [contact page](/en/contact).

## 2 Data and purposes
For your account, we process your email address, player name, account ID, sign-in and session data, age confirmation, preferences and records of accepted terms. For play and the community, we process matters including matches, throws, scores, ratings, badges, presence, friends, invitations and chat messages. This is necessary to perform the agreement for use.

We receive data from you and through your use of DartsPoint. Data about you may also come from other players, for example through invitations, match information or reports, and from authorised team members handling them.

If you sign in with Google, we receive authentication data through Google, such as a unique user identifier, verified email address and available basic profile data, including name and image. You choose your public DartsPoint player name yourself; we do not automatically publish your Google name or profile picture. We do not request access to your Gmail, contacts, files or calendar.

For support, we process your contact details, question, correspondence, attachments, relevant game or account references and the handling of your ticket. For support with the service, we rely on the agreement; for other questions, on our legitimate interest in responding to contact. Exercising GDPR rights is subject to a legal obligation. For team members, we process their role, first name and necessary administration records.

For security, abuse prevention and proportionate moderation, we process technical connection data, filter reports, reports, necessary evidence, measures and audit data. We rely on our legitimate interest in a safe and fair platform, balancing the interests of the people concerned. Public rankings and minimal competition history also support our legitimate interest in an auditable competition.

Necessary sign-in, ticket, account and security emails are part of this service or its security. We send optional updates on the basis of a separate subscription; you can unsubscribe using the option provided. We may process limited data separately for a legal obligation or necessary legal claim.

You do not need to provide payment details, your full date of birth or an identity document to play. Without necessary account and game data, we cannot provide the service. Do not share passwords, sign-in codes or unnecessary sensitive information in chats or tickets.

## 3 What is visible and who has access
Your player name, role, rating and game achievements may be visible to other players and in public rankings, tournaments and division overviews. This public information can also be viewed without an account. Your presence may be visible in rooms, and a message may announce your arrival. Your email address is not in the ordinary player directory.

Room and match chats are visible to participants and other users with access to that area. Private chat is not displayed publicly. Private messages are not end-to-end encrypted; our servers process content for delivery and applied filters. When a report is made, necessary message content may be kept as evidence and reviewed by authorised staff.

Tickets are visible to the requester and team members authorised for the topic. Privacy and account requests are restricted to Platform administration. A staff member replies using their first name. Internal notes are not shown in your ordinary ticket conversation; for a privacy request, we also assess personal data in such notes under the applicable rules.

Scores and ratings are calculated automatically. Filters may block names or messages. For a disputed measure or relevant game decision, you can request human review through support.

## 4 Service providers and transfers
We use Hetzner for hosting, Supabase for database and account services, and Cloudflare Turnstile for bot protection. Email service providers process addresses, message content and delivery data for sign-in and support emails. Google processes data when you choose Google sign-in; [Google’s privacy policy](https://policies.google.com/privacy) also applies to its own services.

Service providers receive only the access needed for their task. We make agreements with processors on security, confidentiality and data use. International providers may also process data outside the European Economic Area. Where this happens, we use an applicable adequacy decision or appropriate safeguards, such as European standard contractual clauses and additional measures where necessary. Through support, you can request information about the applicable safeguards and a copy of them, with confidential information protected.

We may also disclose data where required by a legal obligation or necessary for a legal claim. We do not use your data for other purposes without an appropriate legal basis and the required information.

### Cloudflare Turnstile
We use Cloudflare Turnstile in invisible mode to prevent bots and abuse. Cloudflare processes technical signals for this purpose, such as your IP address, browser information, TLS characteristics and the site identifier.

For protecting DartsPoint, Cloudflare processes this data on behalf of DG Webservices. We base this on our legitimate interest in security, balancing your privacy interests. For improving bot detection, Cloudflare acts as a controller in its own right. More information is in the [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/en-gb/turnstile-privacy-policy/).

## 5 Cookies and local storage
DartsPoint uses functional cookies and similar storage to keep you signed in and remember your choices. A session cookie expires according to session settings or is removed when you sign out. Local preferences may remain until you change them or clear site data. The installable web app may store public files such as icons and styles locally; the offline cache is not intended for personal API responses or chat history.

You can delete cookies and site data in your browser settings. You may then need to sign in and set preferences again. For tracking or other non-essential technologies requiring consent, we ask for a separate choice in advance. Terms and conditions do not replace that choice.

## 6 Retention periods
We keep data for as long as needed for the stated purpose. The normal maximum periods are below. We delete it sooner if it is no longer necessary or a valid deletion request requires it.

| Data | Retention period |
| --- | --- |
| Account, preferences and current game statistics | While your account is in use; after 24 months of inactivity, a warning and 30 days to keep it active |
| Incomplete registration | 30 days |
| Room and match chat | 90 days after the message |
| Private messages and chat drafts | Messages: 12 months; drafts: 7 days after the last change |
| Technical throw data | Up to 12 months, normally sooner on account deletion |
| Minimal match data after account deletion | Up to 24 months after the match, for necessary history, competition verification and disputes |
| Ordinary tickets and attachments | 12 months after closure |
| Privacy requests | Content and attachments: 6 months after completion; afterwards, only minimal handling evidence until 24 months after completion |
| Moderation cases and appeals | Up to 12 months after completion; for an active sanction, only necessary core data with review every six months |
| Technical logs and visit data | Up to 30 days |
| Email processing | Delivery metadata: 90 days; raw received email: 30 days after processing into a ticket |
| Temporary data copies | 7 days after being made available |
| Administration and security audit | 12 months |
| Evidence of terms acceptance | Account lifetime and up to 24 months afterwards, with minimal evidence data |
| Optional updates | Until unsubscribe; minimal evidence of unsubscribe for up to 24 months |

Unconfirmed ordinary guest tickets are removed after 7 days. Received privacy requests and legal reports are assessed separately and are not lost solely because email confirmation is missing.

After account deletion, your public profile and name link disappear. Necessary match data concerning opponents may remain in limited form. A participant code or unique match history may still be identifiable; we therefore do not automatically treat it as anonymous data. Truly irreversible totals without an individual link may be kept.

Where specific data remains necessary for an ongoing dispute, legal claim, legal obligation or still necessary sanction, we keep only that data with restricted access and a recorded review deadline. A hashed email address on a sanctions list remains personal data.

Backups may temporarily contain older data. They are not available for daily use and are replaced or made unusable no later than 30 days after deletion from active systems. After restoration, we reapply deletions before making data available again. A minimal recovery register remains available for no more than 7 additional days to verify this. Google’s and Cloudflare’s own retention policies and rights procedures apply to their independent processing.

## 7 Your rights and account deletion
You can request access, correction, deletion and restriction of processing. Where applicable, you can request data portability. You may object to processing based on legitimate interests because of your particular situation; you can always object to direct marketing. You can withdraw consent without affecting earlier lawful processing.

Choose Privacy and personal data at [DartsPoint Support](/en/support) or email support@dartspoint.nl. We record your request as a ticket. You can do this without an account or during a ban. We route a request received through another offered contact channel internally.

We verify your identity appropriately. Do not send an identity document without being asked. Full account deletion or a data copy may require an additional sign-in or email confirmation. If you no longer have access to your mailbox, we assess a suitable alternative.

After confirmation of account deletion, we close your account and perform the necessary deletion actions without undue delay. You are informed about completion and any limited data we still retain with reasons. Closing a chat tab, blocking a player or merely signing out does not automatically delete your earlier data.

As a rule, we respond to privacy requests within one month. Where an extension is necessary because of complexity or the number of requests, this may take up to two additional months; you receive the reason within the first month. Some rights have statutory exceptions. If a request is refused wholly or partly, we explain why. You can complain to the [Dutch Data Protection Authority](https://autoriteitpersoonsgegevens.nl) and seek a remedy in the competent court.

## 8 Security and changes
We take appropriate security measures, including secure connections, access controls, verification of sensitive actions and restricted access to tickets and administration functions. Keep your own mailbox and sign-in credentials secure too. Report a suspected security issue to support@dartspoint.nl.

DartsPoint is intended for users aged 16 and over. We do not collect a full date of birth for this check. We take minors’ interests into account when processing data.

We update this notice when the service or data processing changes. The current version is on the website. For significant changes, we inform affected users appropriately.'
 from private.legal_versions v where v.document_key='privacy' and v.version='2.0' and encode(sha256(convert_to(btrim(v.markdown),'UTF8')),'hex')='f74fe800515a1a1a75bf47e7e11af409655e1155c19c90d28baf5c5574bcd129'
 on conflict do nothing returning id,source_version_id
)
insert into private.legal_translation_publications(translation_id,reason)
 select i.id,'Translation checked against the published Dutch source, revision en-1; no legal approval claimed.'
 from inserted i join private.legal_publications p on p.version_id=i.source_version_id;

-- Verified against the published Dutch version 2.0. Only exact matching sources are linked.
with inserted as (
 insert into private.legal_translations(source_version_id,language,revision,source_hash,title,summary,markdown)
 select v.id,'en','en-1','9530aea8eaaa94713bc88515ba242a31f4f944b9726327879b3c0170cc9908be','DartsPoint Player Guide','English translation of the same substantive version; no new acceptance required.','# DartsPoint Player Guide
For players • Version 2.0 • 15 October 2026

DartsPoint is developed by DG Webservices. You can play online darts, practise, meet other players and participate in tournaments and divisions. This guide helps you sign in, play and get support.

## 1 Signing in
Open [DartsPoint](/en) and choose sign in. You can select Continue with Google or request a sign-in code using your own email address. Always enter the most recently received code and check your spam folder if needed. Never share your code.

On your first visit, choose a player name of 3 to 20 characters. Letters, numbers, a hyphen and an underscore are allowed. Confirm that you are at least 16 and read and accept the terms and conditions. You start with 1500 DP-punten. Your Google name does not automatically become your player name.

If you already have an account, use the same verified email address. Using Google with a different email address may create two different accounts; contact support first if you are unsure. Your player name, friends and points belong to your existing account.

## 2 Choosing a room
The lobby shows available rooms and their occupancy. A room may be full, private or closed, or have rating requirements. Open a room that suits you. Other players can see that you have entered.

On desktop, the game and room content are on the left. Players and friends are at the top right; chats are at the bottom right. On mobile, open the room, chat and ladder using the bottom navigation. During a match, space remains to see the game.

## 3 Practising and throwing
Enter a room first and open the practice area. You can throw freely or choose an available practice mode, such as doubles, bull or checkouts. Practice does not change your match DP.

A throw has two steps: stop the horizontal indicator for direction, then the vertical indicator for height. Use the throw button or space bar. While typing in a text field or with a dialogue open, the space bar is not a free throw action. Wait for impact before continuing.

## 4 Playing a match
Open the menu beside an available player and invite them. Choose the available settings, such as 301, 501 or 701, double-in, double-out, legs or sets, and ranked or casual. The opponent can accept or decline.

A leg is one game down to zero; a set consists of multiple legs. In best of 3, the first player to win two legs or sets wins, depending on the settings. Each visit has up to three darts.

Single segments score their number, the narrow treble ring scores three times and the double ring twice. The outer bull scores 25 and the red bull 50. With double-in, points count only after a double. With double-out, you must finish on exactly zero with a double; the red bull also counts as a double.

Scoring too many points is a bust. With double-out, leaving one point or reaching zero without a double is also a bust. That visit’s score is reset according to the rules. The scoreboard shows the remaining score and any checkout suggestions.

The server confirms throws and scores. If there is a connection problem, follow the prompt to resume. Repeated turn timeouts can mean a loss; after three consecutive turn timeouts, the match may be ended. Note the match number for support if a problem occurs.

## 5 DP and rankings
You start with 1500 DP. Your rating remains provisionally white until you have played at least 10 ranked matches against at least 5 different opponents. The displayed rating is then red below 1450, yellow/amber from 1450 to 1549 inclusive and green from 1550.

Winning or losing ranked matches can change your rating. Your opponent’s strength counts. The colour or badge beside a player name may indicate a role and is separate from the DP rating. Being a team member gives no advantage in throwing or scoring.

## 6 Chat and friends
Use the tabs for match chat, room chat and private conversations. Check which conversation you are in before sending. The player menu lets you view a profile, add a friend, start a private conversation, or mute, block or report someone.

Muting hides messages for you. Blocking limits contact and may end a friendship or pending request. Closing a chat, blocking someone or signing out does not automatically delete earlier messages. In Settings, choose who may start a new private conversation.

Report unwanted behaviour with a clear reason and only necessary context. Do not share sign-in codes or sensitive data. A report may make necessary message content available to authorised staff.

## 7 Tournaments and divisions
Open a published tournament through the lobby or Clubhouse. Read participation requirements, playing times and check-in rules before registering. Registration alone does not always mean you are checked in. Watch for notifications about your matches.

Divisions have a season, assignments, fixtures and standings. Check which match is ready for you and the period in which you must play it. For questions about participation or scheduling, create a ticket under Tournaments and divisions.

## 8 My tickets
Open Help and tickets or go to My tickets in the Clubhouse. Choose New ticket, select a topic and describe your question. Add a match number, room or tournament where relevant. A screenshot or PDF may help; do not attach a password, sign-in code or identity document.

Your inbox shows your ticket number, status and replies. A staff member replies using their first name. A new reply generates a notification in DartsPoint and by email. You can reply in the same ticket; a reply to the ticket email at support@dartspoint.nl can also be processed.

If you are signed out or cannot sign in, open [DartsPoint Support](/en/support). Enter your first name, email address and question, and confirm your address if required. You do not need a player account. Replies arrive by email; you can reply to support@dartspoint.nl.

A ban does not prevent access to support. Choose Ban or restriction and appeal to request a review of a measure. For privacy questions, choose Privacy and personal data. You can also email support@dartspoint.nl directly; your message is handled as a ticket.

## 9 Account and privacy
Under Account and privacy, you can request access, correction or deletion of data, or object to processing. The request becomes a restricted ticket for Platform administration. We ask for extra confirmation for sensitive actions to protect your account.

If you want to leave, choose Delete account. Read the explanation and confirm the request. You then lose access to playing and chatting, and deletion follows. You receive an email about completion and any limited data still kept for a stated reason. Requesting a data copy before deletion is optional.

Deleting your DartsPoint account does not delete your Google account. Deleted player accounts are not automatically restored by signing in again with Google or email. The [privacy notice](/en/privacy) has more information.

## 10 Settings and help
The Clubhouse contains your matches, records, badges and settings. Adjust sound, vibration, throw button position and motion to your preference. Quiet turn delays the visible arrival of chat messages during your turn; you can view them afterwards.

Supported browsers let you add DartsPoint to your home screen. It remains an online service: signing in, chatting and live play require internet access. Sign out on a shared device.

| Problem | What you can do |
| --- | --- |
| No sign-in code | Check the address and spam folder, wait for the indicated time and request one new code |
| Google sign-in cancelled | Try again or use the email code for the same account |
| Room will not open | Check occupancy, access and rating requirements |
| Practice will not open | Enter an accessible room first |
| Message rejected | Read the filter message or wait for the indicated time |
| Match problem | Follow the resume prompt and include the match number in a support ticket |
| No ticket email | Check spam; when signed in, the reply is also in My tickets |

For further help, use [DartsPoint Support](/en/support) or support@dartspoint.nl.'
 from private.legal_versions v where v.document_key='guide' and v.version='2.0' and encode(sha256(convert_to(btrim(v.markdown),'UTF8')),'hex')='9530aea8eaaa94713bc88515ba242a31f4f944b9726327879b3c0170cc9908be'
 on conflict do nothing returning id,source_version_id
)
insert into private.legal_translation_publications(translation_id,reason)
 select i.id,'Translation checked against the published Dutch source, revision en-1; no legal approval claimed.'
 from inserted i join private.legal_publications p on p.version_id=i.source_version_id;
