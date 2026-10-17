import {getRequestLocale} from '@/lib/i18n/server';
import {DemoGate} from "@/components/darts-demo-gate";
import { PracticeWorkspace } from "@/components/darts-workspace";
export async function generateMetadata(){const locale=await getRequestLocale();return { title: locale==='en'?"Practice area":"Oefenruimte" };}
export default async function PracticePage({ searchParams }: { searchParams: Promise<{ les?: string }> }) {
  const params = await searchParams;
  return <DemoGate room><PracticeWorkspace tutorial={params.les === "1"}/></DemoGate>;
}
