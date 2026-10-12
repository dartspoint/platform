import {DemoGate} from "@/components/darts-demo-gate";
import { DartsPractice } from "@/components/darts-practice";
export const metadata = { title: "Oefenruimte" };
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ les?: string }> }) {
  const params = await searchParams;
  return <DemoGate><DartsPractice tutorial={params.les === "1"}/></DemoGate>;
}
