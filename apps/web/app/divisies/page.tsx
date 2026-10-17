import {getRequestLocale} from '@/lib/i18n/server';
import { DivisionsPanel } from "@/components/darts-divisions";
import { DemoGate } from "@/components/darts-demo-gate";

export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Divisions · DartsPoint":"Divisies · DartsPoint" };}
export default function DivisionsPage() { return <DemoGate><DivisionsPanel/></DemoGate>; }
