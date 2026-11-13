import {DemoGate} from '@/components/darts-demo-gate';
import {DartsAdmin} from '@/components/admin/darts-admin';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Blogbeheer', robots: {index: false, follow: false}};
export default function BlogAdminPage() {return <DemoGate staff><DartsAdmin initialTab="blog"/></DemoGate>;}
