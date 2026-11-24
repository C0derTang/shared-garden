import type { NextConfig } from "next";
import { wgslTurbopackRule } from "@vgpu/wgsl/next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Prepare .wgsl shader imports at build time for vgpu (painted garden world).
  turbopack: {
    rules: {
      "*.wgsl": wgslTurbopackRule({ minify: true }),
    },
  },
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
