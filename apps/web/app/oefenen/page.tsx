import {DemoGate} from "@/components/darts-demo-gate";
import { PracticeWorkspace } from "@/components/darts-workspace";
export const metadata = { title: "Oefenruimte" };
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ les?: string }> }) {
  const params = await searchParams;
  return <DemoGate room><PracticeWorkspace tutorial={params.les === "1"}/></DemoGate>;
}
