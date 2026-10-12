import { notFound, redirect } from "next/navigation";
import { designs, getDesign } from "@/lib/designs";
export function generateStaticParams() { return designs.map(d => ({ variant: d.id })); }
export async function generateMetadata({ params }: { params: Promise<{ variant: string }> }) {
  const design = getDesign((await params).variant);
  return { title: design ? "Spelen" : "DartsPoint" };
}
export default async function DesignPage({ params }: { params: Promise<{ variant: string }> }) {
  const design = getDesign((await params).variant);
  if (!design) notFound();
  redirect("/spelen");
}
