import {getRequestLocale} from '@/lib/i18n/server';
import { DartsApp } from "@/components/darts-app";
import { DemoGate } from "@/components/darts-demo-gate";
export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Play":"Spelen" };}
export default function PlayPage() { return <DemoGate><DartsApp/></DemoGate>; }
