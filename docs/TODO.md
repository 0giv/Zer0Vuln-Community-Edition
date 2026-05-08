# Zer0Vuln — Master TODO

Single source of truth for what's done, in flight, and queued. Resume work from
the **Up Next** section without re-reading the whole conversation history.

**Status legend**

* `[x]` shipped — tested in the live stack
* `[~]` in progress — partially landed; check linked file
* `[ ]` queued — not started yet
* `[!]` blocked — needs a decision before continuing

---

## Up Next (active focus)

The platform is ready to be split into **Community** (free, MIT) and **Pro /
Enterprise** (paid). Before any paid feature can be enforced we need the
licensing primitive itself, then we layer features on top.

* [ ] **License tier system** — the foundation
  * [ ] Add `license_type` to `userdb` (`community` | `pro` | `enterprise`).
  * [ ] `core/licensing.py` helper: `current_tier()`, `require_tier(tier)`, feature flags.
  * [ ] `@require_tier("pro")` decorator for paid endpoints.
  * [ ] Boot-time tier resolution from `LICENSE_KEY` (call out to license API
        or read signed JWT — keep it simple at first, JWT verified by public key).
  * [ ] UI: tier badge in header, paywall modal component for locked features.
  * [ ] Soft agent-count gate in `/devices` enforcement (community = 10).
  * [ ] Telemetry: log every paywall hit so we can size demand.

* [ ] **Multi-tenancy (MSSP mode) — flagship Enterprise feature**
  * [ ] `tenants` table + `tenant_id` foreign key on `users`, `agent_identities`,
        `audit_logs`. (Per-agent DBs already isolate telemetry — leverage that.)
  * [ ] Tenant-scoped sessions: every `@require_permission` route filters by
        the caller's tenant.
  * [ ] Admin tenant ("zer0vuln-ops") that can list / impersonate sub-tenants.
  * [ ] UI: tenant switcher in the sidebar (Enterprise-only, hidden behind tier flag).
  * [ ] Migration plan for existing single-tenant deployments (default tenant
        = "default", everything backfilled).

---

## Paid Tier Roadmap

Priority order (top = build first). See [PROGRESS_REPORT.md](PROGRESS_REPORT.md#paid-tier-roadmap-open-core)
for the rationale.

* [ ] **License tier system** (above) — gating primitive
* [ ] **Multi-tenancy / MSSP mode** (above) — flagship Enterprise
* [ ] **SSO / SAML / SCIM**
  * [ ] SAML 2.0 ACS endpoint (`python3-saml`).
  * [ ] OIDC option (Okta, Azure AD, Google Workspace).
  * [ ] SCIM 2.0 user/group provisioning endpoint (Pro+).
  * [ ] Map IdP groups → Zer0Vuln roles.
* [ ] **Compliance module**
  * [ ] PCI-DSS / ISO 27001 / HIPAA dashboard templates.
  * [ ] Long-term audit retention setting (Community 30d / Pro 1y / Enterprise unlimited+WORM).
  * [ ] WORM enforcement: append-only audit table, periodic hash-chain
        signature for tamper detection.
  * [ ] Scheduled compliance report PDF export.
* [ ] **High availability / clustering**
  * [ ] Stateless Sanic — already mostly there; document worker scaling.
  * [ ] OpenSearch cluster mode toggle.
  * [ ] MySQL read-replica config sample (Pro), full HA helper (Enterprise).
  * [ ] Health endpoints `/healthz` for k8s liveness / readiness probes.
* [ ] **Air-gap update bundles**
  * [ ] CLI `zer0vuln-bundle` that on a connected box snapshots OSV +
        threat-intel feeds + Ollama models into a tarball.
  * [ ] `zer0vuln-bundle apply <file>` on the air-gap host.
  * [ ] Subscription-only: bundles are signed, server verifies signature
        against the customer's enterprise license.
* [ ] **SOAR approval workflow (4-eyes)**
  * [ ] `automations.requires_approval` flag.
  * [ ] Pending-approval queue UI; second operator must click Approve before
        the agent receives the action.
  * [ ] Auto-applied to all destructive actions when tier ≥ Enterprise.
  * [ ] Audit row per approval / rejection.
* [ ] **Premium integrations**
  * [ ] Splunk HTTP Event Collector forwarder.
  * [ ] Microsoft Sentinel (Log Analytics) forwarder.
  * [ ] ServiceNow ITSM ticket creation on CRITICAL alert.
  * [ ] Jira ticket creation.
  * [ ] Slack / Teams webhook templates.
* [ ] **Hosted / SaaS edition** (later)
  * [ ] Single Compose stack per tenant in their cloud account ("BYOC").
  * [ ] Stripe billing hookup.
  * [ ] Self-service tenant creation portal.

---

## Known bugs / tech debt

* [ ] **Frontend `audit-logs` deprecation note in `app.py`** — the route
      protects on `manage_users` but UI hits it from the regular admin path;
      double-check permission alignment.
* [ ] **Container inventory `state` overflow risk** — server schema says
      `VARCHAR(64)` but the agent `state` can be longer when a container is
      starting up. Trim is in place; consider widening to TEXT for safety.
* [ ] **Permissive auth log noise** — every server→agent call prints a
      `[auth] permissive accept` line on hosts without a master env. Move to
      DEBUG level once we ship the proper enrollment flow.
* [ ] **`ScheduleWakeup` for OSV cache** — the `_VULN_DETAIL_CACHE` is
      process-local. On Sanic restart we re-fetch every CVE. Consider
      persisting to MySQL with a 7-day TTL.
* [ ] **`docker compose` Dockerfile builds twice** — once for `app/ingest`
      and once per AI worker. They install the same wheels. Multi-stage with
      a shared base image would cut build time ~3×.
* [ ] **Turkish docstrings/comments** still exist in legacy modules. Runtime
      output is English; source comments are not user-facing so de-prioritized.

---

## Done — Sprint 2026-04 → 2026-05

(Reverse-chronological. Cross-reference: see PROGRESS_REPORT for detail.)

### Code organization & language
* [x] Module reorg — `ai/`, `core/`, `scanners/` packages.
* [x] English-only UI + operator log lines.

### Server-side vuln scanning
* [x] `scanners/vuln.py` reads encrypted `packages`, decrypts via Fernet, queries OSV.
* [x] CVE detail hydration via `/v1/vulns/<id>` with process-level cache.
* [x] `_backfill_missing_summaries` repairs legacy empty rows on every scan.
* [x] Ecosystem detection extended to WSL Ubuntu / generic Linux.
* [x] `POST /<agent>/vulns/scan` manual trigger + UI **Scan Now** button.
* [x] Agent-side `find_vuln` thread disabled.

### Air-gap
* [x] OSV `auto` / `online` / `mirror` mode with public-probe fallback.
* [x] Local font bundling (`@fontsource/inter`, `@fontsource/source-code-pro`).
* [x] Documented external dependencies and how to neutralize each.

### AI pipeline & SOAR autonomy
* [x] Defensive worker autonomously dispatches actions (verdict=ACT, confidence ≥ 0.75, action allow-list).
* [x] `source_data` column on `ai_analysis_results` + idempotent ALTER.
* [x] Strict-JSON verdict prompts + `_extract_json` brace-counter parser.
* [x] Per-agent AI Analysis tab with structured rendering, View Source modal.
* [x] Friendly source filter labels (`Logs (Auto)`, `Alerts (Manual)`, …).
* [x] Auto-dispatched action `AUTO` badge on SOAR Hub.

### Server↔Agent auth
* [x] `_get_agent_keys` + `_try_agent_request` (multi-key probe with fingerprint logging).
* [x] Agent permissive-auth fallback (no `AGENT_MASTER_LICENSE` env → accept any non-empty key with warning).
* [x] `_check_license_header` + `_ws_authorized` shared helper across endpoints.

### Remote desktop
* [x] `/screen/ws` agent endpoint (mss + Pillow JPEG stream).
* [x] `/vnc-proxy/<agent>` server WS-to-WS proxy via `websockets`.
* [x] `VncViewer` rewritten — Blob → `<img>` with FPS/quality dropdowns and live FPS counter.
* [x] TightVNC dependency removed.

### Agent identity & telemetry
* [x] Real hostname + MAC embedded into `OS_INFO` tail; server parses & persists.
* [x] `agent_info` schema extended with `hostname`, `mac_address` (idempotent ALTER).
* [x] `docker_containers` added to agent's `TABLES` sync list.
* [x] Agent's `state` field truncated to 64 chars to fit server schema.
* [x] DiskMonitor cycle logs with persisted/skipped counts.

### Playbooks
* [x] `run_playbook` wrapped in try/except per node; failures recorded in timeline.
* [x] Schema fix: `agent_name` in INSERT, status uses ENUM `success`/`failed`.
* [x] Real status reporting based on per-node `result.ok`.
* [x] `playbook_runs` row created even on early failures so Recent Executions never goes empty.

### Audit logs UI
* [x] Expandable detail modal (every column + extras).
* [x] Robust timestamp parsing (`timestamp`, `@timestamp`, epoch s/ms, ISO).

### Resilience
* [x] `/<agent>/automations/pending` returns `{tasks: []}` when table missing.
* [x] `/api/ai-insights/all` uses `sync_mysql_conn` (root) for SHOW DATABASES.
* [x] `getAgents()` object-vs-string shape mismatch fixed in SoarHub.
* [x] Frontend timestamp display normalization across Dashboard / SoarHub / AI Analysis.

---

## Done — Earlier sprints

(Imported from the legacy Turkish PROGRESS_REPORT; brief recap.)

* [x] Bcrypt password hashing.
* [x] Granular RBAC (`@require_permission`) on 40+ routes; UI button-level gating.
* [x] Audit logging (`audit_logs` table) for privileged actions.
* [x] Pydantic input validation on auth/user endpoints.
* [x] One-liner deploy scripts for Linux (`curl | bash`) and Windows (`irm | iex`).
* [x] Windows Scheduled Task auto-registration for the agent.
* [x] Dynamic agent package generation with embedded license key + IP.
* [x] Docker security monitor (live event stream).
* [x] SOAR Hub page (centralized automation overview).
* [x] Container response actions (`container_kill`, `container_stop`, `container_isolate`).
* [x] Glassmorphism / Modern Zinc UI theme.
* [x] Mobile-responsive sidebar / tables / dashboard.
* [x] aiomysql-backed connection pooling.
* [x] Multi-worker Sanic.
* [x] Global error handling (clean JSON responses).
* [x] `.env`-driven secret management.

---

*Last touched: 2026-05-02. Update this file when starting/finishing items.*
