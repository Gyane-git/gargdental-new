import type { NextConfig } from "next";

// next/image rejects any remote src whose host isn't explicitly whitelisted here.
function remotePatternFor(envUrl: string | undefined) {
  if (!envUrl) return null;

  try {
    const url = new URL(envUrl);

    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/**" as const,
    };
  } catch {
    return null;
  }
}

const dynamicPatterns = [
  remotePatternFor(process.env.NEXT_PUBLIC_MEDIA_BASE_URL),
  remotePatternFor(process.env.NEXT_PUBLIC_APP_URL),
].filter((p): p is NonNullable<typeof p> => p !== null);

const nextConfig: NextConfig = {
  output: "standalone",

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/storage/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/storage/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/**",
      },
      ...dynamicPatterns,
    ],
  },

  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }

    return config;
  },

  allowedDevOrigins: [
    dynamicPatterns.find((p) => p.hostname !== "localhost")?.hostname,
  ].filter((h): h is string => Boolean(h)),

  // Google OAuth / popup communication
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin-allow-popups",
        },
      ],
    },
  ],
};

export default nextConfig;
