import type { NextConfig } from "next";

// Client-only app (canvas, Web Serial, workers): exported as static files.
const nextConfig: NextConfig = {
  output: "export",
  // The dev server only serves its scripts to localhost by default; allow other devices on the home
  // network (e.g. an iPad for the handwriting studio). Development only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default nextConfig;
