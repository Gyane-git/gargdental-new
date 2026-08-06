import type { NextConfig } from "next";

// next/image rejects any remote src whose host isn't explicitly whitelisted here. The dev LAN IP
// baked into NEXT_PUBLIC_MEDIA_BASE_URL (so the app is reachable from other devices) changes
// whenever this machine's network does - reading it directly from the env var here means this
// list stays in sync automatically instead of silently going stale again.
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

const dynamicPatterns = [remotePatternFor(process.env.NEXT_PUBLIC_MEDIA_BASE_URL), remotePatternFor(process.env.NEXT_PUBLIC_APP_URL)].filter(
  (p): p is NonNullable<typeof p> => p !== null,
);

const nextConfig: NextConfig = {
  // Bundles a minimal, self-contained server (.next/standalone/server.js + only the node_modules
  // it actually needs) for deploying to a plain Node host like cPanel's Node.js App/Passenger,
  // instead of shipping the full node_modules tree and running `next start` there.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/storage/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/storage/**" },
      { protocol: "http", hostname: "localhost", port: "3000", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "3001", pathname: "/**" },
      ...dynamicPatterns,
    ],
  },
  // Guards against dev-mode webpack cache corruption ("ENOENT rename ...pack.gz_ -> ...pack.gz",
  // then "__webpack_modules__[moduleId] is not a function" on shared chunks like _error/
  // _not-found). Root cause seen in practice: two `next dev` processes running against this
  // same checkout at once (e.g. one started here, another started manually in a separate
  // terminal) both compile into the same .next dir and corrupt each other's output - only run
  // ONE `npm run dev` per checkout at a time. AV real-time scanning locking the temp file at
  // the wrong moment can produce the same symptom even with a single process. Disabling the
  // on-disk cache in dev removes the file that can get corrupted either way - slightly slower
  // rebuilds, but no more random breakage.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  // Lets this dev server be reached over the LAN (NEXT_PUBLIC_APP_URL points to it there for
  // other devices) without the "Cross origin request detected" warning on every asset request.
  allowedDevOrigins: [dynamicPatterns.find((p) => p.hostname !== "localhost")?.hostname].filter(
    (h): h is string => Boolean(h),
  ),
};

export default nextConfig;
