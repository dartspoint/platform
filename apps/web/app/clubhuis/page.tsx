import {getRequestLocale} from '@/lib/i18n/server';
import { DartsV1Hub } from "@/components/darts-v1-hub";
import { DemoGate } from "@/components/darts-demo-gate";
export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Your clubhouse":"Jouw clubhuis" };}
export default function ClubhousePage() { return <DemoGate><DartsV1Hub/></DemoGate>; }
