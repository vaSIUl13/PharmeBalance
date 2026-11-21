import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const api = process.env.NEST_API_ORIGIN ?? "http://127.0.0.1:3001";
    return [
      { source: "/api/v1/:path*", destination: api + "/api/v1/:path*" },
      ...(process.env.NODE_ENV !== "production" ? [
        { source: "/docs/:path*", destination: api + "/docs/:path*" },
        { source: "/openapi.json", destination: api + "/openapi.json" },
      ] : []),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
        ],
      },
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
