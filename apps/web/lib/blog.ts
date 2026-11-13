/** Presentation helpers; articles always come from the live database projection. */
import {resolveBlogCanonicalOrigin, blogCanonicalPath} from '../../../packages/contracts/src/blog';
import type {Locale} from '../../../packages/i18n/src/locale';
export {BLOG_AUTHORS, BLOG_CATEGORIES, BLOG_SCHEMA_VERSION, blogPath} from '../../../packages/contracts/src/blog';
export type {BlogArticle, BlogDraft, BlogAdminEntry, BlogImage, BlogDocument} from '../../../packages/contracts/src/blog';

export function blogLocale(locale: 'nl-NL' | 'en-GB'): Locale {return locale === 'en-GB' ? 'en' : 'nl';}
export function blogEnvironment() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return process.env.APP_ENV ?? (appUrl?.includes('staging.dartspoint.') ? 'staging' : appUrl && /localhost|127\.0\.0\.1/.test(appUrl) ? 'development' : 'production');
}
export function blogOrigin(locale: 'nl-NL' | 'en-GB') {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL, environment = blogEnvironment();
  return resolveBlogCanonicalOrigin(locale, {environment, appUrl, nlOrigin:process.env.BLOG_CANONICAL_NL_ORIGIN, enOrigin:process.env.BLOG_CANONICAL_EN_ORIGIN});
}
export function blogUrl(article: {slug: string; locale: 'nl-NL' | 'en-GB'}) {
  return new URL(blogCanonicalPath(article.locale, article.slug, blogEnvironment()), blogOrigin(article.locale)).href;
}
export function blogShareImage(article: Pick<import('../../../packages/contracts/src/blog').BlogDraft, 'hero' | 'ogImage'>) {
  if (article.ogImage?.url) return article.ogImage;
  if (!article.hero.url) return article.hero;
  return {...article.hero, url: `${article.hero.url}?variant=share&x=${article.hero.focalPoint.x}&y=${article.hero.focalPoint.y}`, width: 1200, height: 630};
}
