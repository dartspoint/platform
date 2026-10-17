import {getRequestLocale} from '@/lib/i18n/server';
import { DemoGate } from "@/components/darts-demo-gate";
import { DartsAdmin } from "@/components/admin/darts-admin";

export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Platform administration":"Platformbeheer" };}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; toernooi?: string; kamer?: string; widget?: string }> }) {
  const params = await searchParams;
  return <DemoGate staff><DartsAdmin initialTab={params.tab} initialTournamentId={params.toernooi} initialRoomId={params.kamer} initialWidgetType={params.widget}/></DemoGate>;
}
