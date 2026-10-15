import {safeAuthDestination} from '../../../packages/contracts/src/legal';
/** Public CTAs and reauthentication return only to a small local allowlist. */
export function demoLoginDestination(search: string): string {
  return safeAuthDestination(new URLSearchParams(search).get('next'));
}
