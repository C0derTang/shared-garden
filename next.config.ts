import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep this repository's canonical operating procedure unchanged by next dev.
  agentRules: false,
};

export default nextConfig;
