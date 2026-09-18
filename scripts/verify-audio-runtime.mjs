import fs from "node:fs";
import process from "node:process";
import console from "node:console";
import path from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
assert.equal(process.platform, "linux", "Run runtime verification on Linux");
assert.equal(process.arch, "x64", "Production audio targets Linux amd64");
const root = process.cwd();
const trace = path.join(
  root,
  ".next/server/app/api/media/finalize/route.js.nft.json",
);
const paths = new Set();
for (const traceFile of [
  trace,
  path.join(root, ".next/next-server.js.nft.json"),
]) {
  for (const file of JSON.parse(fs.readFileSync(traceFile)).files)
    paths.add(path.resolve(path.dirname(traceFile), file));
}
// An upper bound includes the entire app server tree, not just this route.
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else paths.add(file);
  }
}
walk(path.join(root, ".next/server"));
for (const name of ["ffmpeg", "ffprobe", "limit"]) {
  const executable = path.join(root, "vendor/audio/linux-x64", name);
  assert(paths.has(executable), `${name} must be traced`);
  assert(fs.statSync(executable).mode & 0o111, `${name} must be executable`);
}
let bytes = 0;
for (const file of paths) bytes += fs.statSync(file).size;
assert(
  bytes < 250 * 1024 * 1024,
  "Complete server upper bound must fit function limit",
);
const version = execFileSync(
  path.join(root, "vendor/audio/linux-x64/limit"),
  ["ffprobe", "-version"],
  { encoding: "utf8", timeout: 20000 },
);
assert(version.startsWith("ffprobe version 9.0.1"));
console.log(
  `PASS: traced executable Linux decoder/limiter; entire server + runtime upper bound ${bytes} bytes across ${paths.size} files`,
);
