'use client';
import {useI18n} from '@/lib/i18n/provider';
import {message} from '../../../packages/i18n/src/messages';
import keys from '../../../packages/i18n/src/fixed-copy-keys.json';
import nl from '../../../packages/i18n/src/catalogs/fixedCopy.nl.json';
import en from '../../../packages/i18n/src/catalogs/fixedCopy.en.json';
/** For audited static option arrays only. Values/keys stay in their source form;
 * only their visible label changes. Never use with names or user content. */
export function fixedCopyText(value:string,locale:'nl'|'en'){const key=(keys as Record<string,string>)[value];if(!key)throw new Error('Unregistered fixed UI label');return message(locale==='en'?en:nl,locale,key);}
export function FixedCopy({value}:{value:string}){const {locale}=useI18n();return <>{fixedCopyText(value,locale)}</>;}
