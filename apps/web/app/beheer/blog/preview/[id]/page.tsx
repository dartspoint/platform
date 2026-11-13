import {notFound, redirect} from 'next/navigation';
import {currentActor} from '@/lib/server/auth';
import {BlogArticleDetail} from '@/components/blog/public-blog';
import {blogPreview} from '../../../../../../../packages/data/src/blog';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Afgeschermd artikelvoorbeeld', robots: {index: false, follow: false}};
export default async function BlogPreview({params, searchParams}: {params: Promise<{id: string}>; searchParams: Promise<{revision?: string}>}) {
  let actor;
  try {actor = await currentActor();} catch {redirect('/inloggen');}
  const [{id}, {revision}] = await Promise.all([params, searchParams]);
  const article = await blogPreview(actor, id, revision ? Number(revision) : undefined).catch(() => notFound());
  return <main className="mk-site dp-blog-site"><header className="mk-wrap" style={{paddingTop: 32}}><h1 style={{fontSize: 20}}>Afgeschermd artikelvoorbeeld · revisie {article.revision}</h1><p>Alleen zichtbaar voor bevoegde redactieleden.</p></header><BlogArticleDetail article={article} preview/></main>;
}
