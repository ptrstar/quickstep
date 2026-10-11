import type { NextConfig } from "next";

// Client-only app (canvas, Web Serial, workers): exported as static files.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
