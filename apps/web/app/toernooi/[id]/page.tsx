import { DemoGate } from "@/components/darts-demo-gate";
import { DartsTournamentRoom } from "@/components/darts-tournament-room";

export const metadata = { title: "Toernooikamer" };
export default async function TournamentRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemoGate><DartsTournamentRoom tournamentId={id}/></DemoGate>;
}
