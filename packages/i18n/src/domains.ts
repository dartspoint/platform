import {domainLocale, type Locale} from './locale';

/** Environment boundaries are explicit. Never derive callbacks from forwarded Host. */
export function trustedOrigins(environment = process.env.APP_ENV, configured = process.env.NEXT_PUBLIC_APP_URL) {
  const origins = environment === 'production'
    ? ['https://dartspoint.nl', 'https://www.dartspoint.nl', 'https://dartspoint.app', 'https://www.dartspoint.app']
    : environment === 'staging' ? ['https://staging.dartspoint.nl', 'https://staging.dartspoint.app']
    : ['http://localhost:4300', 'http://127.0.0.1:4300', 'http://127.0.0.1:4302', 'http://localhost:4302'];
  // Additional local QA ports use only an explicitly configured loopback origin.
  if (environment === 'development' && configured) {
    try {const url = new URL(configured); if (['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:' && !url.username && !url.password) origins.push(url.origin);} catch {}
  }
  return [...new Set(origins)];
}
export function isTrustedOrigin(value: string | null, environment = process.env.APP_ENV) {
  if (!value) return false;
  try {const url = new URL(value); return value === url.origin && trustedOrigins(environment).includes(value);} catch {return false;}
}
export function trustedRequestOrigin(request: Request) {
  const url = new URL(request.url), host = request.headers.get('host') ?? url.host;
  return trustedOrigins().find(origin => new URL(origin).host === host) ?? null;
}
export function flowOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && isTrustedOrigin(origin)) return origin;
  return trustedRequestOrigin(request) ?? trustedOrigins()[0];
}
export function canonicalOrigin(locale: Locale) {return locale === 'en' ? 'https://dartspoint.app' : 'https://dartspoint.nl';}
export function requestDomainLocale(request: Request) {return domainLocale(new URL(flowOrigin(request)).host);}
