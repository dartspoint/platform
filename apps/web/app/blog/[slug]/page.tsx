import type {Metadata} from 'next';
import {notFound, permanentRedirect} from 'next/navigation';
import {cache} from 'react';
import {BlogArticleDetail, BlogShell} from '@/components/blog/public-blog';
import {blogUrl, blogLocale, blogOrigin, blogShareImage} from '@/lib/blog';
import {getRequestLocale} from '@/lib/i18n/server';
import {searchContext, searchRobots} from '@/lib/seo';
import {getPublishedBlogArticle, getPublishedBlogRedirect, getPublishedBlogTranslations, blogPublicUrl, listPublishedBlogArticles} from '../../../../../packages/data/src/blog';
export const dynamic = 'force-dynamic';
const readArticle = cache(getPublishedBlogArticle);
type Props = {params: Promise<{slug: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const [{slug}, locale] = await Promise.all([params, getRequestLocale()]);
  const article = await readArticle(slug, locale === 'en' ? 'en-GB' : 'nl-NL');
  if (!article) {
    const redirect = await getPublishedBlogRedirect(slug, locale === "en" ? "en-GB" : "nl-NL");
    if (redirect) permanentRedirect(redirect);
    notFound();
  }
  const title = article.seo.title || article.title, description = article.seo.description || article.excerpt;
  const share = blogShareImage(article), image = {...share, url: new URL(share.url, blogOrigin(article.locale)).href};
  const url = blogPublicUrl(article), {indexable} = searchContext();
  const translations = await getPublishedBlogTranslations(article);
  const languages = translations.length > 1 ? Object.fromEntries(translations.map(other => [blogLocale(other.locale), blogPublicUrl(other)])) : undefined;
  return {
    title: {absolute: title}, description, alternates: {canonical: url, ...(languages ? {languages} : {})}, robots: searchRobots(indexable),
    openGraph: {title, description, url, siteName: 'DartsPoint', type: 'article', locale: article.locale.replace('-', '_'), publishedTime: article.publishedAt, modifiedTime: article.updatedAt, authors: [article.author], section: article.category, tags: article.tags, images: [image]},
    twitter: {card: 'summary_large_image', title, description, images: [image]},
    other: {'socialhero:revision': String(article.revision), ...(article.externalId ? {'socialhero:external-id': article.externalId} : {})},
  };
}
export default async function BlogDetailPage({params}: Props) {
  const [{slug}, locale] = await Promise.all([params, getRequestLocale()]);
  const language = locale === 'en' ? 'en-GB' : 'nl-NL';
  const article = await readArticle(slug, language);
  if (!article) {
    const redirect = await getPublishedBlogRedirect(slug, language);
    if (redirect && redirect !== slug) permanentRedirect(redirect);
    notFound();
  }
  const translations = await getPublishedBlogTranslations(article);
  const others = (await listPublishedBlogArticles(language)).filter(item => item.id !== article.id);
  const related = [...others.filter(item => item.categoryId === article.categoryId), ...others.filter(item => item.categoryId !== article.categoryId)].slice(0, 3);
  const url = blogPublicUrl(article), origin = new URL(url).origin;
  const structuredData = {
    '@context': 'https://schema.org', '@type': article.type === 'blog' ? 'BlogPosting' : 'Article', headline: article.title, description: article.excerpt,
    mainEntityOfPage: {'@type': 'WebPage', '@id': url}, url, inLanguage: article.locale,
    image: [article.hero, blogShareImage(article)].map(image => ({'@type': 'ImageObject', url: new URL(image.url, origin).href, width: image.width, height: image.height, caption: image.alt})),
    datePublished: article.publishedAt, dateModified: article.updatedAt,
    author: {'@type': article.authorId === 'redactie' ? 'Organization' : 'Person', '@id': `${origin}/#author-${encodeURIComponent(article.authorId)}`, name: article.author},
    publisher: {'@type': 'Organization', name: 'DartsPoint', url: origin, logo: {'@type': 'ImageObject', url: new URL('/icons/icon-192.png', origin).href}},
    articleSection: article.category, keywords: article.tags,
  };
  return <BlogShell locale={blogLocale(article.locale)}><script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData).replace(/</g, '\\u003c')}}/><BlogArticleDetail article={article} related={related} translations={translations}/></BlogShell>;
}
