const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, ".next", "static");
const targetDir = path.join(projectRoot, "public", "_next", "static");

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing Next static output: ${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  copyRecursive(sourceDir, targetDir);
  console.log(`Synced Next static assets to ${path.relative(projectRoot, targetDir)}`);
}

main();
