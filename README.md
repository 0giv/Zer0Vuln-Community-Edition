# Zer0Vuln Community Edition

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)
[![Made with Sanic](https://img.shields.io/badge/built%20with-Sanic-FF7600)](https://sanic.dev/)

Zer0Vuln is a self-hosted SIEM, SOAR and EDR platform with locally-run LLM
triage. Cross-platform agents collect telemetry from your endpoints, an
Ollama model classifies incoming events in real time, and a built-in
playbook engine can act on high-confidence threats without sending a
single byte to a third-party AI service.

This is the Community Edition released under AGPL-3.0. Pro / Enterprise
features (multi-tenancy, SAML/SCIM, compliance dashboards, HA, signed
air-gap update bundles, premium integrations) live in a separate paid
distribution. If you want to use the platform without AGPL's
network-copyleft obligations, a commercial licence waiver is available.
The core SIEM + SOAR + Local AI capability is and will remain open-source.

---

## Features

- Local AI triage. Ollama (default `llama3.2:3b`) runs inside the same
  Docker stack. Logs never leave your network.
- Three specialised AI workers. Automation (real-time triage), Manual
  (operator-driven deep scans), Defensive (autonomous SOAR action dispatch).
- Cross-platform agents. Windows and Linux. SIEM, FIM, package inventory,
  open-port scan, Docker monitor, screen streaming.
- Server-side OSV vulnerability scanner. Reads each agent's installed
  packages, queries OSV (or your in-network mirror), persists CVE findings.
- Playbook engine. Visual SOAR playbooks with multi-node execution and
  per-step result tracking.
- Air-gap ready. Local Fernet key, optional OSV mirror, locally-bundled
  fonts, no external CDN. Works fully offline.
- Per-agent enrolment. One-time tokens issue 64-char per-agent keys that
  authenticate every server-agent call.
- Integrated remote desktop. WebSocket JPEG screen streaming without a
  TightVNC install.

---

## Why Zer0Vuln (vs. Wazuh / Elastic SIEM)

Wazuh and Elastic SIEM are excellent log pipelines, but both stop at
"alerts in a dashboard" and assume an analyst will read, correlate and
act. Zer0Vuln is built around the opposite assumption: most small teams
do not have a 24/7 SOC, so the platform itself has to triage and respond.

- **Local LLM triage out of the box.** A bundled Ollama model classifies
  every event in real time. No SIEM rule writing, no ELK query language,
  no external AI API key. Wazuh and Elastic both require you to ship
  events to a separate LLM provider (or buy their AI add-on) to get the
  same behaviour.
- **SOAR is in the box, not a separate product.** Visual playbooks plus
  an autonomous defensive worker that can `BLOCK_IP` / `ISOLATE_HOST` /
  `KILL_PROCESS` etc. directly on the agent. Elastic's equivalent
  (Security + Osquery + Fleet + connectors) is a multi-product setup;
  Wazuh has no native SOAR at all.
- **One stack, one install.** SIEM, EDR agent, vuln scanner, SOAR and
  local AI in a single `docker compose up`. No Logstash, no Filebeat, no
  separate Wazuh manager + indexer + dashboard split.
- **Air-gap by default.** Local Fernet keys, optional OSV mirror, bundled
  fonts, no external CDN, no telemetry phone-home. Works fully offline.
- **AGPL, not "open core".** The triage AI, SOAR engine and agent are all
  open-source. Paid tier only adds enterprise glue (SSO, multi-tenancy,
  HA, compliance reports) — never the core detection capability.

Pick Wazuh/Elastic if you already have analysts and want maximum query
flexibility. Pick Zer0Vuln if you want the box to actually act when
something bad happens.

---

## System Requirements

The full stack (Ollama + OpenSearch + MySQL + RabbitMQ + 3 AI workers +
Sanic API + ingest) is heavy. Plan accordingly:

| Tier | CPU | RAM | Disk | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Minimum (lab / single host, ≤ 5 agents) | 4 cores | **12 GB** | 40 GB SSD | `llama3.2:3b` only; OpenSearch tuned to 1 GB heap. |
| Recommended (small team, 10–50 agents) | 8 cores | **16 GB** | 100 GB SSD | Default compose settings. Room for log retention. |
| Production (50+ agents, longer retention) | 16+ cores | **32 GB+** | 250 GB+ NVMe | Consider separating OpenSearch and Ollama onto their own hosts. |

Rough per-service footprint at idle:

- Ollama (`llama3.2:3b`): ~3 GB RAM, spikes higher under inference.
- OpenSearch: ~2 GB RAM (default heap), disk grows with log volume.
- MySQL 8.0: ~500 MB–1 GB RAM.
- RabbitMQ: ~300 MB RAM.
- Sanic + ingest + 3 AI workers: ~1 GB RAM combined.

Running under 12 GB RAM is possible if you swap to a smaller Ollama
model (`qwen2.5:1.5b` etc.) and shrink the OpenSearch heap, but expect
slow triage. A GPU is **not** required — `llama3.2:3b` runs on CPU
comfortably; if you have one, Ollama will use it automatically.

---

## Quick Start (Docker Compose)

Prerequisites: Docker 24+ with Compose v2, Python 3.10+ (for the agent
build step below). See [System Requirements](#system-requirements) above
before you start — the full stack expects ~16 GB RAM.

```bash
git clone https://github.com/0giv/Zer0Vuln-Community-Edition.git
cd Zer0Vuln-Community-Edition

# Create your local env file. Never commit .env.
cp .env.example .env
# Edit .env. At minimum set DB_PASSWORD to something secure.

# Build the cross-platform agent binaries BEFORE bringing the stack up.
# These produce Zer0Vuln/main (Linux) and Zer0Vuln/main.exe (Windows),
# which the server then serves via /api/agent/download/{linux,windows}.
# Skipping this step means the agent download endpoints return 404.
cd Zer0Vuln
./build_agent.sh          # Linux / macOS / WSL host
# Or, on a Windows host:
# .\build_agent.ps1
cd ..

docker compose up --build -d
```

Why the build step? The server doesn't ship pre-built agent binaries. You
build them once locally so the artefacts you distribute to your endpoints
came from your own toolchain. Rebuild whenever you change anything under
`Zer0Vuln/` and restart the server container so the new binary is picked up.

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
| `ai-worker-{automation,manual,defensive}` | | LLM analysis workers |

Open <http://localhost:8000>. Default credentials are `admin` / `admin123`.
Change them immediately in *Users & Roles*.

---

## Security Notes

### Self-signed certificates

The `certs/` directory ships with self-signed development certificates so
the stack works out of the box on `localhost`. They are intentionally
public and not secrets. They grant zero trust outside the demo.

For any deployment that is not your laptop:

```bash
cd certs
python generate_certs.py            # produces a fresh CA + server cert
```

Or supply your own organizational CA-signed certificate.

### Default secrets

`.env.example` ships with placeholders. The real `.env` is git-ignored.
Never commit it. Rotate the following before exposing the platform to
anything beyond `localhost`:

- MySQL `DB_PASSWORD`
- The default `admin / admin123` UI login
- `LICENSE_KEY` env (used as the agent shared secret). Auto-generated on
  first boot if unset; export your own value to keep it stable across
  restarts.

### Local Fernet keys

The server uses two separate Fernet keys, both auto-generated on first
boot. You do not need to create them manually for a normal install.

| Key | Where it lives | What it protects |
| :--- | :--- | :--- |
| `data/fernet.key` | `data/fernet.key` (or `FERNET_KEY_PATH` env) | Agent telemetry. Handed to each enrolled agent via `/api/agents/bootstrap`. |
| `.env` `FERNET_KEY` | `.env` (written via `set_key`) | Server-internal at-rest encryption (e.g. user-password column). |

Treat both files like private keys:

- `chmod 600 data/fernet.key` (already set)
- `.env` should be `chmod 600` and is git-ignored by default.
- Back them up. Losing `data/fernet.key` makes existing encrypted-at-rest
  telemetry unreadable; losing `.env` `FERNET_KEY` does the same for
  internal server data.

#### Generating a key manually

You only need this if you want to pre-seed the key (for example to ship
the same key to an air-gap host, or to rotate after a leak). Both files
accept the standard `Fernet.generate_key()` output (44-char URL-safe
base64).

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

To pre-write the agent-shared key to disk:

```bash
mkdir -p data
python -c "from cryptography.fernet import Fernet; open('data/fernet.key','wb').write(Fernet.generate_key())"
chmod 600 data/fernet.key
```

To set the server-internal key via `.env`:

```bash
echo "FERNET_KEY=$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" >> .env
chmod 600 .env
```

To store the agent-shared key somewhere other than `data/fernet.key`,
set `FERNET_KEY_PATH` in `.env` (or your process env) before the first
server boot:

```bash
FERNET_KEY_PATH=/run/secrets/zer0vuln.fernet
```

#### Rotating a key

There is no in-place rotation yet. To rotate:

1. Stop the server.
2. Replace `data/fernet.key` (or `.env` `FERNET_KEY`) with a fresh key.
3. Start the server. Existing rows encrypted with the old key will not
   decrypt anymore. Plan for downtime and either re-enrol agents or
   accept the loss of historical encrypted telemetry.

### Threat intel API keys

`OTX_API_KEY` and `VT_API_KEY` are optional. When unset, threat-intel
enrichment becomes a no-op and no external API calls are made. This keeps
the stack air-gap-friendly by default.

### Air-gap mode

Set in `.env`:

```bash
OSV_MODE=auto                          # auto | online | mirror
OSV_MIRROR_URL=http://osv.internal     # only required when air-gapped
```

`auto` probes public OSV at boot and falls back to the mirror on
connection failure. See
[docs/Zer0Vuln_Architecture.md](docs/Zer0Vuln_Architecture.md#5-air-gap-deployment)
for the complete dependency matrix.

---

## Architecture

```
Agents (Win/Linux)
  |
  |  TCP frames + REST polling
  v
ingest (server.py :5001) -----> RabbitMQ -----> AI worker fleet
  |                                                |
  v                                                v
MySQL  (per-agent <name>_db schemas)        ai_analysis_results
  |
  v
app (Sanic :8000)  serves SPA + REST + WebSocket screen proxy
  |
  v
React UI  (locally bundled fonts, ships with the image)
```

For the deep dive (module layout, AI pipeline, SOAR autonomy, on-disk
schema, air-gap surfaces) see
[docs/Zer0Vuln_Architecture.md](docs/Zer0Vuln_Architecture.md).

---

## Manual / Development Setup

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

## Defensive AI Auto-Actions

When the defensive worker's LLM verdict is `ACT` with confidence at or
above `AI_AUTO_ACT_CONF` (default `0.75`) and the recommended action is
on the safe-list, the worker queues the action directly into the agent's
`automations` table:

```
BLOCK_IP, KILL_PROCESS, RESTART_SERVICE, ISOLATE_HOST, DISABLE_USER,
QUARANTINE_FILE, SUSPEND_PROCESS, LOGOFF_USER,
CONTAINER_ISOLATE, CONTAINER_STOP, CONTAINER_KILL
```

Anything else (for example arbitrary command exec, `DELETE_FILE`) is
downgraded to an advisory insight. Auto-dispatched actions are flagged
with a red AUTO badge in the SOAR Hub UI.

To raise the bar (or disable autonomy entirely), tune `AI_AUTO_ACT_CONF`
to `1.0` in `.env`.

---

## Contributing

Issues and PRs welcome. Please:

1. Fork, branch, PR against `main`.
2. Run `npx tsc --noEmit` in `frontend/` and `python -m py_compile app.py`
   before opening.
3. New endpoints behind `@require_permission(...)`. No exceptions.
4. Translations and docs improvements absolutely encouraged.

For larger features, open an issue first to align on direction.

---

## Project Layout

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

## License

Released under the GNU Affero General Public License v3.0. See
[LICENSE](LICENSE).

You are free to use, modify and redistribute Zer0Vuln Community Edition.
The key thing AGPL adds on top of regular GPL: if you run a modified
version on a network server and let others interact with it, you must
offer those users the modified source code under the same licence.

In practice:

- Self-hosting for internal use: no source-disclosure obligations. Use,
  modify and run as you like inside your organisation.
- Public-facing SaaS or managed offering: if you expose a modified
  Zer0Vuln to external users over a network, you must publish your
  modifications under AGPL-3.0.
- Commercial licence waiver: organisations that want to ship a
  closed-source derivative (or avoid the network-copyleft clause
  entirely) can obtain a commercial licence from the project authors.

The "Zer0Vuln" name and any related logos are trademarks of the project
authors and are not covered by the AGPL. Fork freely, but please rename
if you redistribute as your own product.

---

## What's NOT in Community Edition

Community Edition ships the full core SIEM + SOAR + Local-AI capability
under AGPL-3.0 with no artificial caps on agents, retention, log volume
or feature usage. Run it at whatever scale your hardware allows.

The following features live in the paid Pro / Enterprise distribution:

| Feature | Community | Pro | Enterprise |
| :--- | :---: | :---: | :---: |
| Local-AI triage (Ollama) | yes | yes | yes |
| Core SIEM + SOAR + agent | yes | yes | yes |
| OSV vulnerability scanning | yes | yes | yes |
| Visual playbook engine | yes | yes | yes |
| Local user / role management | yes | yes | yes |
| SAML 2.0 / OIDC SSO | no | yes | yes |
| SCIM 2.0 user provisioning | no | yes | yes |
| Multi-tenancy / MSSP mode | no | no | yes |
| Compliance dashboards (PCI-DSS / ISO 27001 / HIPAA) | no | no | yes |
| WORM audit retention | no | no | yes |
| High-availability clustering | no | read replica | full HA |
| Signed air-gap update bundles | no | no | yes |
| SOAR 4-eyes approval workflow | no | no | yes |
| Splunk / MS Sentinel forwarders | no | yes | yes |
| ServiceNow / Jira ticketing | no | no | yes |
| Support | community | email 24 h | phone + SLA |

If any of those matter for your deployment,
[reach out](mailto:oguzhanbayarslan@gmail.com) and we'll point you to
the commercial offering.
