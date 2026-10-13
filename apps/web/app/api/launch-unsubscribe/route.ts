import {launchRequest} from '../../../../../packages/data/src/launch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request){return launchRequest(request,'unsubscribe');}
