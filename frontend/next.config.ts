import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build to plain files in `out/` so the backend can serve the app itself,
  // from the same origin as the API. The page already prerenders to static
  // HTML — the templates are read here, at build time — so nothing is given up
  // by dropping the Node server that `next start` would otherwise run.
  output: "export",
};

export default nextConfig;
