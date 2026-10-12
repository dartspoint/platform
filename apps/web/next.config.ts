import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", outputFileTracingRoot: new URL("../..", import.meta.url).pathname, experimental: { cpus: 2 } };
export default config;
