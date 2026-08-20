// cPanel/Passenger entry point: "Setup Node.js App" runs this file directly with node (not via an
// npm script), and sets PORT itself - Passenger proxies the subdomain to whatever port it assigns.
// Requires `next build` to have already produced .next/ (done automatically by this project's
// package.json "postinstall" script, which cPanel's "Run NPM Install" button triggers).
const { createServer } = require("http");
const fs = require("fs");
const path = require("path");
const next = require("next");

// Resolve the app root explicitly so Passenger/cPanel cwd differences do not break .next/static.
const app = next({ dev: false, dir: path.resolve(__dirname) });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const serveStaticFile = (res, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
};

const serveNextStaticAsset = (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith("/_next/static/")) return false;

  const relative = pathname.slice("/_next/static/".length);
  const staticRoot = path.resolve(__dirname, ".next", "static");
  const filePath = path.resolve(staticRoot, relative);
  if (!filePath.startsWith(staticRoot + path.sep) && filePath !== staticRoot) return false;

  return serveStaticFile(res, filePath);
};

app.prepare().then(() => {
  createServer((req, res) => {
    if (serveNextStaticAsset(req, res)) return;
    handle(req, res);
  }).listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });
});
