import {getRequestLocale} from '@/lib/i18n/server';
import type { ReactNode } from "react";
export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Email examples":"E-mailvoorbeelden", robots: { index: false, follow: false, googleBot: { index: false, follow: false } }, alternates: { canonical: null } };}
export default function EmailExamplesLayout({ children }: { children: ReactNode }) { return children; }
