# PKC Cloud Workbench Design

Date: 2026-10-26

## Goal

Deploy the existing PKC event workbench to Render and store its shared event data in
Supabase so that administrators, staff, mobile control, and OBS browser sources can
use the same data from different devices.

The deployment must be private: only the owner and explicitly invited staff can log
in. The existing local mode must remain available for offline operation.

## Cost Target

The normal operating target is USD 0 per month:

- Supabase Free: 500 MB database, 5 GB egress, Auth, and Realtime.
- Render Free: one web service, 512 MB RAM, 0.1 CPU, 750 instance hours per month.

The service can pause after inactivity:

- Supabase Free projects pause after one week without activity.
- Render Free services spin down after 15 minutes without inbound traffic and take
  about one minute to start again.

The cloud architecture must therefore keep all durable data outside the Render
filesystem.

## Non-goals

- Public read-only pages or anonymous visitor access.
- GitHub Pages hosting.
- Moving image, audio, or OCR engine assets to Supabase Storage.
- Supporting multiple Render instances or horizontal scaling.
- A paid SLA for live production broadcasts.

## Architecture

The browser talks only to the Render-hosted Node service. The Node service
authenticates the user with Supabase Auth, reads and writes event data through
Supabase Postgres, and continues serving the existing page, API, SSE, OBS, and OCR
routes.

```text
Staff browser / mobile / OBS
            |
            | HTTPS, HttpOnly session cookie
            v
Render Free Node web service
  - static pages and assets
  - session authentication
  - director SSE and in-memory live state
  - DeepSeek OCR proxy
  - cloud data adapter
            |
            | server-side service-role REST calls
            v
Supabase
  - Auth users
  - pkc_records
  - pkc_backups
  - pkc_audit
```

The browser never receives the Supabase Service Role Key.

## Data Model

`pkc_records` stores the existing JSON documents under these keys:

- `library`
- `matches`
- `prefs`
- `heroPick`
- `bracket`
- `context`
- `heroStats`

Each row contains `key`, `data jsonb`, `revision bigint`, `updated_at`, and
`updated_by`.

`pkc_backups` stores prior record snapshots. `pkc_audit` stores user-facing data
operations. Both tables are retained for the current rolling backup and audit views.

Writes go through the transactional database function `pkc_write_record`. It checks
an optional expected revision, copies the prior document into `pkc_backups`, writes
the next document, increments the revision, and appends an audit row in one
transaction. A revision mismatch raises `pkc_revision_conflict`.

On startup in cloud mode, the service loads all records. Missing records are seeded
from the repository's `数据/*.json` files. The service keeps an in-memory read cache
and refreshes it periodically so a restart or an external write cannot leave it
permanently stale.

## Authentication

Cloud mode is enabled by the required environment variables
`PKC_CLOUD=1`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`.

The login page posts email and password to `/api/auth/login`. The Node service calls
Supabase Auth and stores access and refresh tokens in HttpOnly, SameSite cookies.
It does not persist the password.

All application pages, assets, APIs, and OBS routes require a valid session except:

- `/login`
- `/api/auth/login`
- `/healthz`

`PKC_ALLOWED_EMAILS` is an optional comma-separated allowlist. If it is present,
sign-in is accepted only for listed addresses. Supabase public sign-up must be
disabled in the project dashboard.

Invalid or expired sessions receive an HTML redirect for navigation requests and
HTTP 401 JSON for API requests. Logout revokes the Supabase session and clears local
cookies.

## Local Compatibility

When cloud variables are not configured:

- startup and storage behavior remain file-based;
- `启动.bat` continues to work without network access;
- existing local tests and remote-mode behavior remain valid.

When cloud mode is configured:

- `PORT` is honored for Render;
- the service binds to `0.0.0.0`;
- event data and backup/audit operations use Supabase;
- a public health endpoint is available;
- `DEEPSEEK_API_KEY` is supplied by the Render environment.

## Deployment

The repository includes:

- `render.yaml` for a Free Node web service;
- a Node version file;
- GitHub Actions for fast regression tests;
- Supabase SQL migration;
- `.env.example` and deployment documentation.

Render connects to the GitHub repository and redeploys when the configured branch is
updated. The first startup imports local JSON documents into empty Supabase tables.

## Failure Handling

- Supabase unavailable at startup: cloud startup fails closed with a clear log.
- Supabase unavailable during a write: the request returns an error and the cloud
  record is unchanged.
- Revision conflict: existing HTTP 409 behavior is preserved.
- Invalid authentication: no event API executes.
- Render cold start: the service reloads all durable records from Supabase.
- DeepSeek key missing: OCR reports the existing configuration error; other data
  operations remain usable.

## Testing

Automated tests cover:

- local adapter reads and writes;
- cloud adapter request construction and error mapping;
- transactional write result and revision conflict;
- authentication allowlist and unauthenticated route behavior;
- cloud bootstrap from local data;
- Render configuration and health endpoint behavior.

The existing regression suite must continue to pass, except for any pre-existing
baseline failure documented separately.

