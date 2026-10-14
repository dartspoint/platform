import { DemoGate } from "@/components/darts-demo-gate";
import { DartsAdmin } from "@/components/admin/darts-admin";

export const metadata = { title: "Platformbeheer" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; toernooi?: string; kamer?: string }> }) {
  const params = await searchParams;
  return <DemoGate staff><DartsAdmin initialTab={params.tab} initialTournamentId={params.toernooi} initialRoomId={params.kamer}/></DemoGate>;
}
