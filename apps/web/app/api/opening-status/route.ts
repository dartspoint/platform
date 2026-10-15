import {openingStatus} from '@/lib/opening';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(openingStatus(), {
    headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'},
  });
}
