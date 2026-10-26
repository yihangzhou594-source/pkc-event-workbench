import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const render = read("render.yaml");
assert.match(render, /type:\s*web/);
assert.match(render, /runtime:\s*node/);
assert.match(render, /plan:\s*free/);
assert.match(render, /startCommand:\s*npm start/);
assert.match(render, /healthCheckPath:\s*\/healthz/);
assert.match(render, /key:\s*PKC_CLOUD/);
assert.match(render, /key:\s*PKC_REMOTE/);
assert.match(render, /key:\s*SUPABASE_URL/);
assert.match(render, /key:\s*SUPABASE_ANON_KEY/);
assert.match(render, /key:\s*SUPABASE_SERVICE_ROLE_KEY/);
assert.match(render, /key:\s*PKC_ALLOWED_EMAILS/);
assert.match(render, /key:\s*DEEPSEEK_API_KEY/);
assert.doesNotMatch(render, /eyJ[A-Za-z0-9_-]{20,}/, "render.yaml must not contain Supabase tokens");

const nodeVersion = read(".node-version").trim();
assert.ok(Number(nodeVersion.split(".")[0]) >= 20, ".node-version must be Node 20 or newer");

const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.private, true);
assert.equal(pkg.scripts.start, "node server.mjs");
assert.match(pkg.scripts.test, /test-all\.mjs --fast/);

const example = read(".env.example");
for (const key of [
  "PKC_CLOUD",
  "PKC_REMOTE",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PKC_ALLOWED_EMAILS",
  "DEEPSEEK_API_KEY",
]) {
  assert.match(example, new RegExp("^" + key + "=", "m"), key + " missing from .env.example");
}

const workflow = read(".github/workflows/ci.yml");
assert.match(workflow, /node-version:\s*20/);
assert.match(workflow, /npm test/);

const guide = read("部署到Supabase和Render.md");
for (const text of [
  "SQL Editor",
  "pkc_write_record",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PKC_ALLOWED_EMAILS",
  "/healthz",
  "登录",
  "休眠",
]) {
  assert.ok(guide.includes(text), "deployment guide missing: " + text);
}

console.log("test-cloud-deploy-config: ok");
