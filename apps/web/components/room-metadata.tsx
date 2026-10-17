"use client";
import {useState} from 'react';
import {Globe2} from 'lucide-react';
import {useI18n} from '@/lib/i18n/provider';
import {roomRegions, type RoomMetadata, type RoomRegion, type RoomLanguage} from '../../../packages/contracts/src/room-metadata';
import type {Locale} from '../../../packages/i18n/src/locale';
const subdivisions = {nl: {'GB-ENG': 'Engeland', 'GB-SCT': 'Schotland', 'GB-WLS': 'Wales'}, en: {'GB-ENG': 'England', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales'}};
export function regionName(region: RoomRegion, locale: Locale): string {
  if (!region) return locale === 'en' ? 'No region' : 'Geen regio';
  if (region === 'international') return locale === 'en' ? 'International' : 'Internationaal';
  return subdivisions[locale][region as keyof typeof subdivisions.nl] ?? new Intl.DisplayNames([locale], {type: 'region'}).of(region) ?? region;
}
export function RoomBadge({room}: {room: RoomMetadata}) {
  const {locale, t} = useI18n();
  const name = regionName(room.region ?? null, locale);
  return <span className="dp-room-metadata">
    {room.region === 'international' ? <Globe2 size={19} role="img" aria-label={name}/> : room.region && <img src={`/flags/${room.region.toLowerCase()}.svg`} width={24} height={18} alt={name} title={name}/>}
    {room.primaryLanguage && <span className="dp-room-language" title={t('rooms.language')}>{room.primaryLanguage === 'nl' ? 'Nederlands' : room.primaryLanguage === 'en' ? 'English' : t('rooms.multilingual')}</span>}
  </span>;
}
export function RoomMetadataEditor({value, onChange}: {value: RoomMetadata & {name?: string}; onChange: (patch: RoomMetadata) => void}) {
  const {locale, t} = useI18n();
  const [search, setSearch] = useState('');
  const regions = roomRegions.filter(region => region === value.region || `${region} ${regionName(region, locale)}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale))).sort((a, b) => regionName(a, locale).localeCompare(regionName(b, locale), locale));
  return <fieldset className="dp-room-editor"><legend>{t('rooms.region')} / {t('rooms.language')}</legend>
    <label>{t('rooms.region')}<input type="search" aria-label={t('rooms.region')} value={search} onChange={e => setSearch(e.target.value)}/>
      <select aria-label={t('rooms.region')} value={value.region ?? ''} onChange={e => onChange({region: (e.target.value || null) as RoomRegion})}>
        <option value="">{t('rooms.none')}</option><option value="international">{t('rooms.international')}</option>
        {regions.map(region => <option key={region} value={region}>{regionName(region, locale)}</option>)}
      </select>
    </label>
    <label>{t('rooms.language')}<select value={value.primaryLanguage ?? ''} onChange={e => onChange({primaryLanguage: (e.target.value || null) as RoomLanguage})}><option value="">{t('rooms.noLanguage')}</option><option value="nl">Nederlands</option><option value="en">English</option><option value="multilingual">{t('rooms.multilingual')}</option></select></label>
    <p>{t('rooms.metadataHelp')}</p><p className="dp-room-preview"><strong>{value.name}</strong><RoomBadge room={value}/></p>
  </fieldset>;
}
export type RoomMetadataFilter = {region: string; language: string};
export const EMPTY_ROOM_FILTER: RoomMetadataFilter = {region: '', language: ''};
export function matchesRoomMetadata(room: RoomMetadata, filter: RoomMetadataFilter) {
  return (!filter.region || (room.region ?? 'none') === filter.region) && (!filter.language || (room.primaryLanguage ?? 'none') === filter.language);
}
export function RoomMetadataFilters({rooms, value, onChange}: {rooms: RoomMetadata[]; value: RoomMetadataFilter; onChange: (value: RoomMetadataFilter) => void}) {
  const {locale, t} = useI18n();
  const regions = [...new Set(rooms.map(room => room.region).filter(Boolean))] as Exclude<RoomRegion, null>[];
  return <div className="dp-room-filters"><label><span className="sr-only">{t('rooms.region')}</span><select value={value.region} onChange={e => onChange({...value, region: e.target.value})}><option value="">{t('rooms.allRegions')}</option><option value="none">{t('rooms.none')}</option>{regions.sort((a,b) => regionName(a, locale).localeCompare(regionName(b, locale), locale)).map(region => <option key={region} value={region}>{regionName(region, locale)}</option>)}</select></label>
    <label><span className="sr-only">{t('rooms.language')}</span><select value={value.language} onChange={e => onChange({...value, language: e.target.value})}><option value="">{t('rooms.allLanguages')}</option><option value="none">{t('rooms.noLanguage')}</option><option value="nl">Nederlands</option><option value="en">English</option><option value="multilingual">{t('rooms.multilingual')}</option></select></label>
    {(value.region || value.language) && <button type="button" onClick={() => onChange(EMPTY_ROOM_FILTER)}>{t('rooms.resetFilters')}</button>}
  </div>;
}
