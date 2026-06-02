import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build under .next/standalone — required by the
  // Dockerfile so the runner stage doesn't need node_modules at runtime.
  output: "standalone",
};

export default nextConfig;
