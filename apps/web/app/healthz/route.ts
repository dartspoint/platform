export const dynamic='force-dynamic';
export async function GET(){return Response.json({ok:true,release:process.env.RELEASE_SHA??'local-development'});}
