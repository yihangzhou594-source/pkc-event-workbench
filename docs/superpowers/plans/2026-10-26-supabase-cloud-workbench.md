# Supabase Cloud Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private Supabase-backed cloud storage and authentication while preserving the existing local PKC workbench, then deploy the service through GitHub and Render.

**Architecture:** A shared Node data gateway exposes memory-cached synchronous reads and asynchronous transactional writes. Local mode keeps JSON files; cloud mode uses Supabase REST and transactional RPCs. A server-side Supabase Auth session protects all routes, and Render serves the existing Node application.

**Tech Stack:** Node.js 20+, built-in fetch and HTTP server, Supabase Postgres/Auth, Render Blueprint, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-supabase-cloud-workbench-design.md`

## Global Constraints

- Preserve local mode when cloud environment variables are absent.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `DEEPSEEK_API_KEY` to the browser.
- Use Node.js 20 or newer and avoid runtime npm dependencies unless strictly required.
- Cloud mode must fail closed when required Supabase configuration is missing.
- All event writes must preserve current revision-conflict semantics.
- Existing baseline failure `tools/test-start-script.mjs` must be investigated without masking new failures.

---

### Task 1: Supabase schema and transactional RPC

**Files:**
- Create: `supabase/migrations/202610260001_pkc_cloud_workbench.sql`
- Create: `supabase/README.md`

**Interfaces:**
- Produces: tables `pkc_records`, `pkc_backups`, `pkc_audit`; RPC
  `pkc_write_record(p_key text, p_data jsonb, p_expected_revision bigint, p_actor text)`.
- Produces: RPC `pkc_restore_record(p_backup_id bigint, p_actor text)`.

- [ ] **Step 1: Write migration SQL**

Create the three tables with UUID-safe text keys, JSONB documents, bigint
revisions, timestamps, foreign-key backups, indexes, RLS enabled, browser roles
revoked, and service-role-only grants.

Implement `pkc_write_record` and `pkc_restore_record` as `security definer` plpgsql
functions with a fixed `search_path`.

- [ ] **Step 2: Validate SQL locally**

Run:

```powershell
node --check server.mjs
rg -n "pkc_write_record|pkc_restore_record|row level security" supabase/migrations
```

Expected: the SQL file contains both functions and RLS declarations; Node checking
remains unchanged.

- [ ] **Step 3: Document dashboard application**

Document how to paste the migration into the Supabase SQL Editor and verify the three
tables and two functions.

- [ ] **Step 4: Commit**

```powershell
git add supabase
git commit -m "feat: add Supabase cloud schema"
```

### Task 2: Cloud data gateway

**Files:**
- Create: `lib/data-store.mjs`
- Create: `tools/test-data-store.mjs`
- Modify: `tools/test-all.mjs`

**Interfaces:**
- Produces: `initializeDataStore(options?) => Promise<void>`
- Produces: `hasCloudDataStore() => boolean`
- Produces: `readData(key, fallback) => unknown`
- Produces: `revisionOf(key) => string`
- Produces: `writeData(key, data, options?) => Promise<{ok, key, revision, conflict?}>`
- Produces: backup and audit functions used by `server.mjs`.

**Test Example:**

```js
import assert from "node:assert/strict";
import { createDataGateway } from "../lib/data-store.mjs";

const calls = [];
const gateway = createDataGateway({
  cloud: true,
  remote: async (path, init) => {
    calls.push({ path, init });
    return { ok: true, json: async () => [] };
  },
});

await gateway.initialize();
assert.equal(gateway.hasCloudDataStore(), true);
assert.ok(calls.some((call) => call.path.startsWith("/rest/v1/pkc_records")));
```

- [ ] **Step 1: Write the failing gateway tests**

Test cloud loading, local fallback, revision tracking, base-revision conflict,
bootstrap seeding, backup listing, and audit append.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node tools/test-data-store.mjs
```

Expected: FAIL because `lib/data-store.mjs` does not exist.

- [ ] **Step 3: Implement the gateway**

Use built-in `fetch`. Cloud requests send `apikey` and `Authorization: Bearer`
headers from `SUPABASE_SERVICE_ROLE_KEY`. Local requests use `json-store.mjs`.

Cloud writes call:

```text
POST /rest/v1/rpc/pkc_write_record
body: {"p_key":"matches","p_data":{},"p_expected_revision":3,"p_actor":"email"}
```

Seeding upserts missing local documents with `Prefer: resolution=merge-duplicates`.
Periodic refresh replaces cache records only when cloud revision increases.

- [ ] **Step 4: Run tests**

Run:

```powershell
node tools/test-data-store.mjs
git diff --check
```

Expected: PASS, no whitespace errors.

- [ ] **Step 5: Commit**

```powershell
git add lib/data-store.mjs tools/test-data-store.mjs tools/test-all.mjs
git commit -m "feat: add cloud data gateway"
```

### Task 3: Migrate event persistence to the gateway

**Files:**
- Modify: `server.mjs`
- Modify: `lib/competition-context.mjs`
- Modify: `lib/competition-teams.mjs`
- Modify: `lib/hero-stats-store.mjs`
- Modify: `director/routes.mjs`
- Create: `tools/test-cloud-data-integration.mjs`

**Interfaces:**
- Consumes: Task 2 gateway functions.
- Produces: cloud startup initialization before `server.listen`.
- Produces: same `/api/store/*`, teams, context, hero stats, backup, and audit routes.

- [ ] **Step 1: Write failing integration tests**

Test that a cloud-mode server write reaches the RPC, a revision conflict returns 409,
context and team reads use the gateway cache, and startup seeds all seven record
keys.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node tools/test-cloud-data-integration.mjs
```

Expected: FAIL because persistence is still direct filesystem access.

- [ ] **Step 3: Refactor persistence**

Replace direct event-data reads and writes in the four modules with gateway calls.
Keep filesystem access for static assets and encrypted local DeepSeek configuration.
Make cloud startup wait for gateway initialization before listening.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node tools/test-data-store.mjs
node tools/test-cloud-data-integration.mjs
node tools/test-json-store.mjs
node tools/test-remote-match-api.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add server.mjs director/routes.mjs lib/competition-context.mjs lib/competition-teams.mjs lib/hero-stats-store.mjs tools/test-cloud-data-integration.mjs
git commit -m "feat: store event data in Supabase"
```

### Task 4: Supabase Auth and private route gate

**Files:**
- Create: `lib/auth-gate.mjs`
- Create: `director/login.html`
- Create: `tools/test-auth-gate.mjs`
- Modify: `server.mjs`
- Modify: `tools/test-all.mjs`

**Interfaces:**
- Produces: `createAuthGate(options) => {enabled, authenticate, login, logout, publicPath}`.
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PKC_ALLOWED_EMAILS`.

- [ ] **Step 1: Write failing auth tests**

Test successful password login, wrong password, allowlist rejection, expired access
with refresh, unauthenticated HTML redirect, unauthenticated API 401, health access,
and logout cookie clearing.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node tools/test-auth-gate.mjs
```

Expected: FAIL because `lib/auth-gate.mjs` and `/login` do not exist.

- [ ] **Step 3: Implement auth gate and login page**

Use Supabase GoTrue token, refresh, user, and logout endpoints through built-in
`fetch`. Store tokens in HttpOnly `SameSite=Strict` cookies, add `Secure` outside
localhost, and cache successful token validation briefly.

Gate every route except `/login`, `/api/auth/login`, and `/healthz`.

- [ ] **Step 4: Run auth and route tests**

Run:

```powershell
node tools/test-auth-gate.mjs
node tools/check-console.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/auth-gate.mjs director/login.html tools/test-auth-gate.mjs server.mjs tools/test-all.mjs
git commit -m "feat: require Supabase login"
```

### Task 5: Render and GitHub deployment configuration

**Files:**
- Create: `render.yaml`
- Create: `.node-version`
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Create: `部署到Supabase和Render.md`
- Create: `tools/test-cloud-deploy-config.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: Free Render Node web service with `/healthz`, `PORT`, cloud variables,
  and automatic redeploys.
- Produces: CI validation for syntax and fast regression tests.

- [ ] **Step 1: Write failing deployment tests**

Assert that `render.yaml` uses Node, `plan: free`, `node server.mjs`, and
`/healthz`; `.node-version` is >=20; CI runs `node tools/test-all.mjs --fast`; docs
name every required environment variable.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node tools/test-cloud-deploy-config.mjs
```

Expected: FAIL because deployment files do not exist.

- [ ] **Step 3: Add deployment files and guide**

Create the Render Blueprint with `PKC_CLOUD=1`, `PKC_REMOTE=1`, and all secret values
marked `sync: false`. Document Supabase project creation, migration, auth users,
Render environment setup, first deployment, verification, cold starts, pause
recovery, and local rollback.

- [ ] **Step 4: Run tests**

Run:

```powershell
node tools/test-cloud-deploy-config.mjs
node --check server.mjs
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add render.yaml .node-version .env.example .github/workflows/ci.yml 部署到Supabase和Render.md tools/test-cloud-deploy-config.mjs package.json
git commit -m "chore: add Render cloud deployment"
```

### Task 6: Full verification and live deployment

**Files:**
- Modify: documentation only if live verification exposes a mismatch.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: deployed HTTPS URL with private login and Supabase-backed data.

- [ ] **Step 1: Run complete regression**

Run:

```powershell
node tools/test-all.mjs --fast
```

Expected: all tests pass except the pre-existing start-script failure; investigate and
fix that test if it is caused by the changes.

- [ ] **Step 2: Commit and push**

```powershell
git status --short
git push origin HEAD
```

Expected: GitHub receives the implementation branch.

- [ ] **Step 3: Apply Supabase migration and configure users**

Use the logged-in Supabase browser session to run the migration SQL, disable public
sign-up, and verify the owner/staff accounts.

- [ ] **Step 4: Configure Render**

Create or update the Render web service from the GitHub branch. Set
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`PKC_ALLOWED_EMAILS`, and `DEEPSEEK_API_KEY`.

- [ ] **Step 5: Verify live behavior**

Check:

```text
GET /healthz                         -> 200
GET / without login                  -> redirect to /login
POST /api/store/library without login -> 401
valid login                          -> workbench loads
save and reload a record             -> revision grows in Supabase
second browser session               -> sees the same record
OBS `/obs/chart`                     -> loads as authenticated staff
```

- [ ] **Step 6: Report deployment**

Provide the live URL, branch, Supabase project reference, service status, test
results, free-plan limitations, and any manual owner-only steps.
