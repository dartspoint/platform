// Run with Node >= 22.18. No mail is sent. Generated examples are never auth templates.
import { mkdir, writeFile } from "node:fs/promises";
import { DARTS_EMAIL_EXAMPLES, renderDartsEmail, renderSupabaseOtpTemplate } from "../lib/darts-email-templates.ts";
const root = new URL("./", import.meta.url);
await mkdir(new URL("examples/", root), { recursive: true });
for (const example of DARTS_EMAIL_EXAMPLES) {
  const rendered = renderDartsEmail(example.input);
  // Relative asset path makes the checked-in artifact open offline without requesting a third-party server.
  const html = rendered.html.replace("https://dartspoint.nl/assets/emails/dartspoint-logo.png", "../../public/assets/emails/dartspoint-logo.png");
  await writeFile(new URL(`examples/${example.id}.html`, root), html);
  await writeFile(new URL(`examples/${example.id}.txt`, root), rendered.text + "\n");
}
for (const [name, origin] of [["production", "https://dartspoint.nl"], ["staging", "https://staging.dartspoint.nl"]]) {
  const rendered = renderSupabaseOtpTemplate({ origin });
  await writeFile(new URL(`supabase-otp-${name}.html`, root), rendered.html);
  await writeFile(new URL(`supabase-otp-${name}.txt`, root), rendered.text + "\n");
}
console.log("Generated 7 offline email examples + dynamic production/staging Supabase OTP templates. Nothing sent.");
