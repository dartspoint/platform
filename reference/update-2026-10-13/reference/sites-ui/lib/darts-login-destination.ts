/** Public CTAs may continue into a small set of local demo routes, never arbitrary URLs. */
export function demoLoginDestination(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (next && ["/lobby", "/spelen", "/divisies", "/clubhuis", "/oefenen"].includes(next)) return next;
  if (next && /^\/toernooi\/[a-zA-Z0-9_-]{1,100}$/.test(next)) return next;
  return "/lobby";
}
