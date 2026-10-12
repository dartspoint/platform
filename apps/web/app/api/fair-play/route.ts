// The retired prototype route accepts no production throws.
export async function POST(){return Response.json({code:"retired_protocol",error:"Gebruik het officiële speelveld."},{status:410});}
