import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/api/media/finalize": [
      "./vendor/audio/darwin-*/**",
      "./vendor/audio/*.xz",
      "./vendor/audio/*.asc",
      "./vendor/audio/*.sh",
      "./vendor/audio/Dockerfile",
    ],
  },
  outputFileTracingIncludes: {
    "/api/media/finalize": ["./vendor/audio/linux-x64/*"],
  },
  // Keep this repository's canonical operating procedure unchanged by next dev.
  agentRules: false,
};

export default nextConfig;
