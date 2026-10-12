import { DartsLobby } from "@/components/darts-lobby";
import { DemoGate } from "@/components/darts-demo-gate";
export const metadata = { title: "Lobby" };
export default function LobbyPage() { return <DemoGate><DartsLobby/></DemoGate>; }
