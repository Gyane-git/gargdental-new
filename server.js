// cPanel/Passenger entry point: "Setup Node.js App" runs this file directly with node (not via an
// npm script), and sets PORT itself - Passenger proxies the subdomain to whatever port it assigns.
// Requires `next build` to have already produced .next/ (done automatically by this project's
// package.json "postinstall" script, which cPanel's "Run NPM Install" button triggers).
const { createServer } = require("http");
const next = require("next");

const app = next({ dev: false });
const handle = app.getRequestHandler();
const port = process.env.PORT || 3000;

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });
});
