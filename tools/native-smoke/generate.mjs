// Assemble the disposable native-audio smoke project OUTSIDE this repository.
//
//   node tools/native-smoke/generate.mjs /absolute/path/outside/the/repo
//
// The result is a standalone Next application with one authorized route, the
// reviewed decoder module, the pinned Linux programs and one fixed fixture.
// It contains no Supabase configuration, dependency or access of any kind, and
// it is never linked to the product project. Deployment, if any, belongs to
// issue #37 and is removed again once bounded evidence has been retained.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const target = path.resolve(process.argv[2] ?? "");
assert(process.argv[2], "Pass an output directory outside this repository");
const inside = (child, parent) =>
  child === parent || child.startsWith(parent + path.sep);
assert(
  !inside(target, repository) && !inside(repository, target),
  "Refusing to assemble the artifact inside this repository",
);
assert(
  !fs.existsSync(target) || fs.readdirSync(target).length === 0,
  "Refusing to overwrite a non-empty directory",
);

const FIXTURE = "src/test/fixtures/audio/tone-5.webm";
const copy = (from, to, mode) => {
  const destination = path.join(target, to);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repository, from), destination);
  if (mode !== undefined) fs.chmodSync(destination, mode);
};
const write = (to, contents) => {
  const destination = path.join(target, to);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents, { mode: 0o644 });
};

const { dependencies, devDependencies } = JSON.parse(
  fs.readFileSync(path.join(repository, "package.json")),
);
// Exactly the runtime this probe needs. No @supabase/*, no image library.
const needed = ["next", "react", "react-dom", "server-only"];
// Next must find these before building TypeScript in a clean CI environment.
const buildNeeded = ["typescript", "@types/react", "@types/node"];
write(
  "package.json",
  JSON.stringify(
    {
      name: "native-audio-smoke",
      private: true,
      scripts: { build: "next build", start: "next start" },
      dependencies: Object.fromEntries(
        needed.map((name) => [name, dependencies[name]]),
      ),
      devDependencies: Object.fromEntries(
        buildNeeded.map((name) => [name, devDependencies[name]]),
      ),
      engines: { node: "24.x" },
    },
    null,
    2,
  ) + "\n",
);
write(
  "tsconfig.json",
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        isolatedModules: true,
        jsx: "react-jsx",
        skipLibCheck: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  ) + "\n",
);
write(
  "next.config.ts",
  `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/smoke": ["./vendor/audio/linux-x64/*", "./${FIXTURE}"],
  },
};

export default nextConfig;
`,
);
write(
  "src/app/layout.tsx",
  `export const metadata = { title: "smoke" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
);
write(
  "src/app/page.tsx",
  `export default function Page() {
  return <main>No content.</main>;
}
`,
);
// The only route. Authorization is decided inside the reviewed handler, before
// anything is read, hashed or spawned.
write(
  "src/app/api/smoke/route.ts",
  `import { handleSmokeRequest } from "@/native-smoke/handler";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { status, body } = await handleSmokeRequest(request.headers);
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
`,
);

copy("tools/native-smoke/handler.ts", "src/native-smoke/handler.ts");
copy("src/lib/media/audio.ts", "src/lib/media/audio.ts");
copy("src/lib/media/error.ts", "src/lib/media/error.ts");
copy(FIXTURE, FIXTURE);
for (const name of ["ffmpeg", "ffprobe", "limit"])
  copy(`vendor/audio/linux-x64/${name}`, `vendor/audio/linux-x64/${name}`, 0o755);
copy("vendor/audio/COPYING.LGPLv2.1", "vendor/audio/COPYING.LGPLv2.1");
copy("vendor/audio/README.md", "vendor/audio/README.md");
write(
  ".gitignore",
  ["node_modules/", ".env", ".env.*", ".next/", ".vercel/", ""].join("\n"),
);

// Fail closed on anything resembling product configuration or credentials.
const forbidden = [
  "SUPABASE",
  "supabase",
  "NEXT_PUBLIC_",
  "sb_secret_",
  "sb_publishable_",
];
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else files.push(file);
  }
};
walk(target);
for (const file of files) {
  const bytes = fs.readFileSync(file);
  // Scan text only; the fixture and the programs are checked by hash instead.
  if (bytes.includes(0)) continue;
  const text = bytes.toString("utf8");
  for (const marker of forbidden)
    assert(!text.includes(marker), `${path.relative(target, file)} mentions ${marker}`);
}
const digest = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(
  digest(path.join(target, FIXTURE)),
  "5bc420d62cb176d5cdf8cf77e7a62d3a96609ec57c86d7e84b99f05fae990648",
  "Fixture hash must match the handler's pinned value",
);
for (const name of ["ffmpeg", "ffprobe", "limit"]) {
  const file = path.join(target, "vendor/audio/linux-x64", name);
  assert(fs.statSync(file).mode & 0o111, `${name} must stay executable`);
  assert.equal(digest(file), digest(path.join(repository, "vendor/audio/linux-x64", name)));
}
assert(
  !fs.existsSync(path.join(target, "vercel.json")) &&
    !fs.existsSync(path.join(target, ".vercel")),
  "No deployment link is generated here",
);
// Refuse to hand over an artifact that quietly became a git checkout.
try {
  execFileSync("git", ["-C", target, "rev-parse", "--git-dir"], {
    stdio: "ignore",
  });
  assert.fail("The artifact must not live inside a git repository");
} catch (error) {
  if (error instanceof assert.AssertionError) throw error;
}
console.log(
  `PASS: assembled ${files.length} files in ${target}; set NATIVE_SMOKE_TOKEN (>= ${32} characters) before serving GET /api/smoke`,
);
