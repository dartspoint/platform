-- expand-only: explicit whole-word checks for name separators, without arbitrary substrings.
insert into private.content_filter_rules(seed_key,term,category,scope,match_type,description,active,aliases)
select replace(seed_key,'chat-word:','name-word:'),term,category,'name','word','Volledig woord in een naam, ook naast een underscore of koppelteken; geen substring in gewone namen.',active,aliases
from private.content_filter_rules where seed_key like 'chat-word:%' on conflict(seed_key) do nothing;
