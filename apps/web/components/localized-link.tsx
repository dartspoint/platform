"use client";
import Link from 'next/link';
import type {ComponentProps} from 'react';
import {useI18n} from '@/lib/i18n/provider';
import {localisedHref} from '../../../packages/i18n/src/locale';
export function LocalizedLink(props:ComponentProps<typeof Link>) {
 const {locale}=useI18n();
 return <Link {...props} href={typeof props.href==='string'?localisedHref(props.href,locale):props.href}/>;
}
