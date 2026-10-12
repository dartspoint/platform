import { DartsApp } from "@/components/darts-app";
import { DemoGate } from "@/components/darts-demo-gate";
export const metadata = { title: "Spelen" };
export default function PlayPage() { return <DemoGate><DartsApp/></DemoGate>; }
