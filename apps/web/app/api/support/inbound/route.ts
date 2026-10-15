import {z} from 'zod';
import {receiveSupportWebhook} from '../../../../../../packages/data/src/support-inbound';
import {DomainError} from '../../../../../../packages/contracts/src/index';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{return Response.json(await receiveSupportWebhook(request),{headers:{'Cache-Control':'no-store'}});}catch(error){if(error instanceof DomainError)return Response.json({code:error.code},{status:error.status});if(error instanceof z.ZodError)return Response.json({code:'webhook_payload'},{status:400});console.error(JSON.stringify({event:'support_webhook_failed'}));return Response.json({code:'unavailable'},{status:503});}}
