import {getRequestLocale} from '@/lib/i18n/server';
import { DemoGate } from "@/components/darts-demo-gate";
import { DartsTournamentRoom } from "@/components/darts-tournament-room";

export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Tournament room":"Toernooikamer" };}
export default async function TournamentRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemoGate><DartsTournamentRoom tournamentId={id}/></DemoGate>;
}
