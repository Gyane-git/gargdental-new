// cPanel/Passenger entry point: "Setup Node.js App" runs this file directly with node (not via an
// npm script), and sets PORT itself - Passenger proxies the subdomain to whatever port it assigns.
// Requires `next build` to have already produced .next/ (done automatically by this project's
// package.json "postinstall" script, which cPanel's "Run NPM Install" button triggers).
const { createServer } = require("http");
const path = require("path");
const next = require("next");

// Resolve the app root explicitly so Passenger/cPanel cwd differences do not break .next/static.
const app = next({ dev: false, dir: path.resolve(__dirname) });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });
});
