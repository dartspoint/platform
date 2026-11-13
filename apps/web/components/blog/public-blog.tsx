import type {Locale} from "../../../../packages/i18n/src/locale";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";
import { MarketingNav } from "@/components/darts-marketing";
import { blogUrl, blogShareImage, type BlogArticle } from "@/lib/blog";
import { BlogContent, blogHeadings, blogReadTime } from "./blog-content";
import { BlogShare } from "./blog-share";
import "./darts-blog.css";

export function blogDate(article: BlogArticle) {
  return new Intl.DateTimeFormat(article.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(article.publishedAt));
}

function focus(article: BlogArticle) {
  return { objectPosition: `${article.hero.focalPoint.x * 100}% ${article.hero.focalPoint.y * 100}%` };
}

export function BlogShell({ children, locale = "nl" }: { children: ReactNode; locale?: Locale }) {
  const en = locale === "en";
  return <div className="mk-site dp-blog-site">
    <a className="mk-skip-link" href="#inhoud">{en ? "Skip to content" : "Ga naar inhoud"}</a>
    <MarketingNav blog/>
    <main id="inhoud">{children}</main>
    <footer className="dp-blog-footer"><div className="mk-wrap">
      <a href="/" className="mk-brand" aria-label="DartsPoint startpagina"><img src="/brand/icon.svg" alt="" width="44" height="44"/><img src="/brand/wordmark.svg" alt="DartsPoint" width="167" height="38"/></a>
      <nav aria-label="Footer blog"><a href={`/${locale}/blog`}>Blog</a><a href={`/${locale}/handleiding`}>{en ? "Player guide" : "Handleiding"}</a><a href={`/${locale}/privacy`}>{en ? "Privacy notice" : "Privacyverklaring"}</a><a href={`/${locale}/contact`}>Contact</a></nav>
    </div></footer>
  </div>;
}

function cardImage(article: BlogArticle) {
  return blogShareImage(article);
}

function BlogCard({ article }: { article: BlogArticle }) {
  const image = cardImage(article);
  const english = article.locale === "en-GB";
  return <article className="dp-blog-card" lang={article.locale}>
    <a href={blogUrl(article)}>
      <div className="dp-blog-card-image"><img src={image.url} width={image.width} height={image.height} alt="" style={article.ogImage?.url ? undefined : focus(article)} loading="lazy" decoding="async"/></div>
      <div className="dp-blog-card-content">
        {article.category && <span className="dp-blog-category">{article.category}</span>}
        <h3>{article.title}</h3>
        <p>{article.excerpt}</p>
        <span className="dp-blog-card-footer"><span><Clock3 size={14} aria-hidden="true"/> {blogReadTime(article.content)} min</span><span>{english ? "Read article" : "Lees artikel"} <ArrowUpRight size={17} aria-hidden="true"/></span></span>
      </div>
    </a>
  </article>;
}

function BlogCardGrid({ articles }: { articles: BlogArticle[] }) {
  return <div className="dp-blog-grid">{articles.map(article => <BlogCard key={article.slug} article={article}/>)}</div>;
}

export function HomeBlogSection({ articles, locale = "nl" }: { articles: BlogArticle[]; locale?: Locale }) {
  const en = locale === "en";
  if (!articles.length) return null;
  return <section className="dp-blog-home" aria-labelledby="dp-blog-home-title"><div className="mk-wrap">
    <div className="dp-blog-section-header"><div><span className="mk-kicker"><span/>DARTSPOINT BLOG</span><h2 id="dp-blog-home-title">{en ? "From the first dart " : "Van eerste pijl "}<em>{en ? "to the final double." : "tot laatste dubbel."}</em></h2></div><a className="dp-blog-text-link" href={`/${locale}/blog`}>{en ? "Visit the blog" : "Naar het blog"} <ArrowUpRight size={18} aria-hidden="true"/></a></div>
    <BlogCardGrid articles={articles.slice(0, 3)}/>
  </div></section>;
}

export function BlogIndex({ articles, category, query = "", locale = "nl" }: { articles: BlogArticle[]; category?: string; query?: string; locale?: Locale }) {
  const en = locale === "en";
  const categories = Array.from(new Set(articles.map(article => article.category).filter(Boolean)));
  const selected = category && categories.includes(category) ? category : undefined;
  const visible = articles.filter(article => (!selected || article.category === selected) && (!query || [article.title, article.excerpt, ...article.tags].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const featured = selected || query || visible.length < 2 ? undefined : visible[0];
  const featuredImage = featured && cardImage(featured);
  const gridArticles = featured ? visible.slice(1) : visible;

  return <BlogShell locale={locale}>
    <section className="dp-blog-masthead">
      <div className="mk-wrap">
        <a className="dp-blog-back" href="/"><ArrowLeft size={16} aria-hidden="true"/> DartsPoint</a>
        <h1>DartsPoint <em>blog.</em></h1>
        <p>{en ? "From checkout tips to your first online match. For everyone who stays for one more leg." : "Van checkouttips tot je eerste online wedstrijd. Voor iedereen die na de laatste leg nog even blijft hangen."}</p>
      </div>
    </section>
    {featured && featuredImage && <section className="mk-wrap dp-blog-featured" aria-labelledby="dp-featured-title">
      <div className="dp-blog-featured-copy" lang={featured.locale}>
        {featured.category && <span className="mk-kicker"><span/>{featured.category.toLocaleUpperCase(featured.locale)}</span>}
        <h2 id="dp-featured-title">{featured.title}</h2>
        <p>{featured.excerpt}</p>
        <div className="dp-blog-featured-meta"><time dateTime={featured.publishedAt}>{blogDate(featured)}</time><span><Clock3 size={15} aria-hidden="true"/> {blogReadTime(featured.content)} min</span></div>
        <a className="mk-cta" href={blogUrl(featured)}>{featured.locale === "en-GB" ? "Read the article" : "Lees het artikel"} <ArrowUpRight size={18} aria-hidden="true"/></a>
      </div>
      <div className="dp-blog-featured-image"><img src={featuredImage.url} width={featuredImage.width} height={featuredImage.height} style={featured.ogImage?.url ? undefined : focus(featured)} alt="" fetchPriority="high"/></div>
    </section>}
    <section className="mk-wrap dp-blog-index" id="artikelen" aria-labelledby="dp-blog-index-title">
      <div className="dp-blog-section-header"><h2 id="dp-blog-index-title">{selected ?? (query ? (en ? "Search results" : "Zoekresultaten") : featured && gridArticles.length ? (en ? "More articles" : "Meer artikelen") : (en ? "All articles" : "Alle artikelen"))}</h2>
        {categories.length > 0 && <nav aria-label="Filter artikelen op categorie" className="dp-blog-filters">
          <a href={`/${locale}/blog#artikelen`} aria-current={!selected ? "page" : undefined}>{en ? "All" : "Alles"}</a>
          {categories.map(item => <a key={item} href={`/${locale}/blog?categorie=${encodeURIComponent(item)}#artikelen`} aria-current={selected === item ? "page" : undefined}>{item}</a>)}
        </nav>}
      </div>
      <form className="dp-blog-search" action={`/${locale}/blog`} role="search"><label htmlFor="blog-search">{en ? "Search articles" : "Zoek artikelen"}</label><div><input id="blog-search" type="search" name="q" defaultValue={query} maxLength={120} placeholder={en ? "Title or topic" : "Titel of onderwerp"}/>{selected && <input type="hidden" name="categorie" value={selected}/>}<button className="mk-cta" type="submit">{en ? "Search" : "Zoeken"}</button></div></form>
      {gridArticles.length ? <BlogCardGrid articles={gridArticles}/> : !featured && <p className="dp-blog-empty">{query ? (en ? "No articles match your search." : "Geen artikelen gevonden voor deze zoekopdracht.") : (en ? "No articles have been published yet." : "Er zijn nog geen artikelen gepubliceerd.")}</p>}
    </section>
  </BlogShell>;
}

export function BlogArticleDetail({ article, related = [], translations = [], preview = false }: { article: BlogArticle; related?: BlogArticle[]; translations?: BlogArticle[]; preview?: boolean }) {
  const english = article.locale === "en-GB";
  const Title = preview ? "h2" : "h1";
  const headings = preview ? [] : blogHeadings(article.content);
  return <>
    <article className={preview ? "mk-site dp-blog-site dp-blog-article dp-blog-preview" : "dp-blog-article"} lang={article.locale}>
      <header className="mk-wrap dp-blog-article-hero">
        <div className="dp-blog-article-title">
          {!preview && <a className="dp-blog-back" href={`/${english ? "en" : "nl"}/blog`}><ArrowLeft size={16} aria-hidden="true"/> {english ? "Back to blog" : "Terug naar het blog"}</a>}
          {article.category && <span className="mk-kicker"><span/>{article.category.toLocaleUpperCase(article.locale)}</span>}
          <Title>{article.title}</Title>
          <p>{article.excerpt}</p>
          {!preview && translations.some(item => item.id !== article.id) && <nav className="dp-blog-translations" aria-label={english ? "Article languages" : "Artikeltalen"}>{translations.filter(item => item.id !== article.id).map(item => <a key={item.id} href={blogUrl(item)} hrefLang={item.locale === "en-GB" ? "en" : "nl"}>{item.locale === "en-GB" ? "Read in English" : "Lees in het Nederlands"}</a>)}</nav>}
          <div className="dp-blog-byline"><span className="dp-blog-author-icon" aria-hidden="true"><img src="/brand/icon.svg" alt="" width="32" height="32"/></span><span><strong>{article.author}</strong><span><time dateTime={article.publishedAt}>{blogDate(article)}</time> <span aria-hidden="true">·</span> {blogReadTime(article.content)} min</span></span></div>
        </div>
        {article.hero.url && <figure className="dp-blog-article-picture"><img src={article.hero.url} alt={article.hero.alt} width={article.hero.width} height={article.hero.height} style={focus(article)} fetchPriority={preview ? "auto" : "high"}/></figure>}
      </header>
      <div className="mk-wrap dp-blog-article-columns">
        <aside className="dp-blog-article-aside" aria-hidden={headings.length < 2 || undefined}>{headings.length >= 2 && <nav aria-label={english ? "Table of contents" : "Inhoudsopgave"}><strong>{english ? "In this article" : "In dit artikel"}</strong>{headings.map(heading => <a key={heading.id} href={`#${heading.id}`}>{heading.label}</a>)}</nav>}</aside>
        <div className="dp-blog-article-main">
          <BlogContent content={article.content} headingAnchors={!preview}/>
          {article.tags.length > 0 && <ul className="dp-blog-tags" aria-label={english ? "Topics" : "Onderwerpen"}>{article.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}
          {!preview && <div className="dp-blog-share-row"><strong>{english ? "Share this article" : "Deel dit artikel"}</strong><BlogShare title={article.title} url={blogUrl(article)} english={english}/></div>}
        </div>
      </div>
    </article>
    {!preview && related.length > 0 && <section className="mk-wrap dp-blog-related" aria-labelledby="dp-blog-related-title">
      <div className="dp-blog-section-header"><h2 id="dp-blog-related-title">{english ? "More from DartsPoint" : "Verder lezen"}</h2><a href={`/${english ? "en" : "nl"}/blog`} className="dp-blog-text-link">{english ? "All articles" : "Alle artikelen"} <ArrowRight size={18} aria-hidden="true"/></a></div>
      <BlogCardGrid articles={related}/>
    </section>}
  </>;
}
