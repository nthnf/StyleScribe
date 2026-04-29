import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/*": ["./node_modules/@google/design.md/dist/linter/**/*"],
  },
};

export default nextConfig;
