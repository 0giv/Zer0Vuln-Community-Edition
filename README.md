# Zer0Vuln — Community Edition

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)
[![Made with Sanic](https://img.shields.io/badge/built%20with-Sanic-FF7600)](https://sanic.dev/)

**Zer0Vuln** is a self-hosted, AI-assisted **SIEM + SOAR + EDR** platform with
locally-run LLM triage. It collects telemetry from cross-platform agents,
runs an Ollama model against incoming events for real-time threat
classification, and ships an integrated playbook system that can autonomously
respond to high-confidence threats — all without sending a single byte to a
third-party AI service.

> This is the **Community Edition** released under **AGPL-3.0**. Pro / Enterprise
> features (multi-tenancy, SAML/SCIM, compliance dashboards, HA, signed
> air-gap update bundles, premium integrations) live in a separate paid
> distribution. If you'd like to use the platform without AGPL's
> network-copyleft obligations, a commercial licence waiver is available.
> The core SIEM + SOAR + Local AI capability is and will remain open-source.

---

## ✨ Highlights

- **Local AI triage.** Ollama (default `llama3.2:3b`) runs inside the same
  Docker stack. Logs never leave your network.
- **Three specialized AI workers.** Automation (real-time triage), Manual
  (operator-driven deep scans), Defensive (autonomous SOAR action dispatch).
- **Cross-platform agents.** Windows + Linux. SIEM, FIM, package inventory,
  open-port scan, Docker monitor, screen streaming.
- **Server-side OSV vulnerability scanner.** Reads each agent's installed
  packages, queries OSV (or your in-network mirror), persists CVE findings.
- **Playbook engine.** Visual SOAR playbooks with multi-node execution and
  per-step result tracking.
- **Air-gap ready.** Local Fernet key, optional OSV mirror, locally-bundled
  fonts, no external CDN — works fully offline.
- **Per-agent enrolment.** One-time tokens issue 64-char per-agent keys that
  authenticate every server↔agent call.
- **Integrated remote desktop.** WebSocket JPEG screen streaming — no
  TightVNC install required.

---

## 🚀 Quick Start (Docker Compose)

**Prerequisites:** Docker 24+ with Compose v2.

```bash
git clone https://github.com/<your-org>/Zer0Vuln-Community-Edition.git
cd Zer0Vuln-Community-Edition

# Create your local env file (NEVER commit .env)
cp .env.example .env
# Edit .env — at minimum set DB_PASSWORD to something secure

docker compose up --build -d
```

This brings up the full stack:

| Service | Port | Purpose |
| :--- | :--- | :--- |
| `app` | `:8000` | REST API + React UI |
| `ingest` | `:5001` | Async TCP log collector |
| `db` | `:3307` | MySQL 8.0 (host port; 3306 inside the network) |
| `rabbitmq` | `:5672` / `:15672` | Job queue + management UI |
| `ollama` | `:11434` | Local LLM runtime (auto-pulls `llama3.2:3b`) |
| `opensearch` | `:9200` | Full-text log search |
| `opensearch-dashboards` | `:5601` | Optional log explorer |
| `ai-worker-{automation,manual,defensive}` | — | LLM analysis workers |

Open <http://localhost:8000> — default credentials are **admin / admin123**.
**Change them immediately** in *Users & Roles*.

---

## 🔐 Security Notes

### Self-signed certificates

The `certs/` directory ships with **self-signed development certificates** so
the stack works out of the box on `localhost`. They are intentionally public
and **not** secrets — they grant zero trust outside the demo.

For any deployment that's not your laptop:

```bash
cd certs
python generate_certs.py            # produces a fresh CA + server cert
```

Or supply your own organizational CA-signed certificate.

### Default secrets

`.env.example` ships with placeholders. The real `.env` is git-ignored —
**never commit it**. Rotate the following before exposing the platform to
anything beyond `localhost`:

- MySQL `DB_PASSWORD`
- The default `admin / admin123` UI login
- `LICENSE_KEY` env (used as the agent shared secret) — auto-generated on
  first boot if unset; export your own value to keep it stable across restarts

### Local Fernet key

Agent telemetry is encrypted with a Fernet key auto-generated on first server
boot at `data/fernet.key`. Treat that file like a private key:

- `chmod 600 data/fernet.key` (already set)
- Back it up — losing it makes existing encrypted-at-rest data unreadable
- Override path with the `FERNET_KEY_PATH` env if you store secrets centrally

### Threat intel API keys

`OTX_API_KEY` and `VT_API_KEY` are optional. When unset, threat-intel
enrichment becomes a no-op — no external API calls are made. This keeps the
stack air-gap-friendly by default.

### Air-gap mode

Set in `.env`:

```bash
OSV_MODE=auto                          # auto | online | mirror
OSV_MIRROR_URL=http://osv.internal     # only required when air-gapped
```

`auto` probes public OSV at boot and falls back to the mirror on connection
failure. See [docs/Zer0Vuln_Architecture.md](docs/Zer0Vuln_Architecture.md#5-air-gap-deployment)
for the complete dependency matrix.

---

## 🧠 Architecture (TL;DR)

```
Agents (Win/Linux)
  │
  │  TCP frames + REST polling
  ▼
ingest (server.py :5001) ────► RabbitMQ ───► AI worker fleet
  │                                                │
  ▼                                                ▼
MySQL  (per-agent <name>_db schemas)        ai_analysis_results
  │
  ▼
app (Sanic :8000)  ─── serves SPA + REST + WebSocket screen proxy
  │
  ▼
React UI  (locally bundled fonts, ships with the image)
```

For the deep dive — module layout, AI pipeline, SOAR autonomy, on-disk
schema, air-gap surfaces — see
**[docs/Zer0Vuln_Architecture.md](docs/Zer0Vuln_Architecture.md)**.

---

## 🛠 Manual / Development Setup

```bash
# 1. Database
mysql -u root -p < init_userdb.sql
mysql -u root -p < init.sql

# 2. Backend
pip install -r requirements.txt
python app.py

# 3. Ingest service (separate terminal)
python server.py

# 4. Frontend dev server (HMR)
cd frontend
npm install
npm run dev
```

### AI workers

Each worker is the same `ai_worker.py` script with a different role:

```bash
WORKER_TYPE=automation python ai_worker.py
WORKER_TYPE=manual     python ai_worker.py
WORKER_TYPE=defensive  python ai_worker.py
```

Production deployments should let `docker-compose.yaml` handle it.

---

## 🤖 Defensive AI Auto-Actions

When the defensive worker's LLM verdict is `ACT` with confidence ≥
`AI_AUTO_ACT_CONF` (default `0.75`) **and** the recommended action is on the
safe-list, the worker queues the action directly into the agent's
`automations` table:

```
BLOCK_IP, KILL_PROCESS, RESTART_SERVICE, ISOLATE_HOST, DISABLE_USER,
QUARANTINE_FILE, SUSPEND_PROCESS, LOGOFF_USER,
CONTAINER_ISOLATE, CONTAINER_STOP, CONTAINER_KILL
```

Anything else (e.g. arbitrary command exec, `DELETE_FILE`) is downgraded to
an advisory insight. Auto-dispatched actions are flagged with a red **AUTO**
badge in the SOAR Hub UI.

To raise the bar (or disable autonomy entirely), tune `AI_AUTO_ACT_CONF` to
`1.0` in `.env`.

---

## 🤝 Contributing

Issues and PRs welcome. Please:

1. Fork → branch → PR against `main`.
2. Run `npx tsc --noEmit` in `frontend/` and `python -m py_compile app.py`
   before opening.
3. New endpoints behind `@require_permission(...)` — no exceptions.
4. Translations / docs improvements absolutely encouraged.

For larger features, open an issue first to align on direction.

---

## 📦 Project Layout

```
.
├── app.py                # Sanic API + React SPA host
├── server.py             # Async TCP ingest
├── ai_worker.py          # AI worker fleet (3 modes)
├── ai/
│   ├── utils.py          # LLM helpers, AI cache, SOAR queueing
│   └── intel.py          # OTX / VirusTotal indicator enrichment (opt-in)
├── core/
│   ├── mq.py             # RabbitMQ publisher
│   └── opensearch.py     # OpenSearch index/search
├── scanners/
│   └── vuln.py           # Server-side OSV vuln scanner
├── frontend/             # React 18 + TypeScript SPA
├── Zer0Vuln/             # Cross-platform agent
├── certs/                # Self-signed dev certs (regenerate for prod)
├── docs/                 # Architecture, progress, TODO
└── docker-compose.yaml   # Full-stack deployment
```

---

## 📜 License

Released under the **GNU Affero General Public License v3.0** —
see [LICENSE](LICENSE).

You're free to use, modify, and redistribute Zer0Vuln Community Edition. The
key thing AGPL adds on top of regular GPL: **if you run a modified version
on a network server and let others interact with it, you must offer those
users the modified source code** under the same licence.

What this means in practice:

- **Self-hosting for internal use:** No source-disclosure obligations — use,
  modify, and run as you like inside your organisation.
- **Public-facing SaaS / managed offering:** If you expose a modified
  Zer0Vuln to external users over a network, you must publish your
  modifications under AGPL-3.0.
- **Commercial licence waiver:** Organisations that want to ship a
  closed-source derivative (or avoid the network-copyleft clause entirely)
  can obtain a commercial licence from the project authors.

The "Zer0Vuln" name and any related logos are trademarks of the project
authors and are *not* covered by the AGPL — fork freely, but please rename
if you redistribute as your own product.

---

## 🧱 What's NOT in Community Edition

These features live in the paid **Pro / Enterprise** distribution:

- Multi-tenancy / MSSP mode
- SAML 2.0 / OIDC / SCIM 2.0
- Compliance dashboards (PCI-DSS / ISO 27001 / HIPAA) + WORM audit
- High-availability clustering helpers
- Signed air-gap update bundles (OSV + threat-intel + Ollama models)
- SOAR 4-eyes approval workflow
- Splunk / MS Sentinel / ServiceNow / Jira integrations
- Priority support & SLA

If any of those matter for your deployment, [reach out](#) — we'll point you
to the commercial offering.
