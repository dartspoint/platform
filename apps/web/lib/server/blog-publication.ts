import 'server-only';
import {revalidatePath} from 'next/cache';
import {randomUUID} from 'node:crypto';
import {blogResponse} from './blog-http';

/** The public pages are force-dynamic; the next real HTTP visit also completes invalidation. */
export function revalidateBlogPaths(){
 revalidatePath('/blog','layout');revalidatePath('/en/blog','layout');revalidatePath('/nl/blog','layout');revalidatePath('/');revalidatePath('/sitemap.xml');
}
export function supersededPublicationResponse(result:unknown){
 const requestId=randomUUID();return blogResponse({...(result as object),code:'REVISION_CONFLICT',message:'Deze publicatie is door een nieuwere revisie vervangen. Lees de actuele artikelstatus.',requestId},409,{'X-Request-ID':requestId});
}
