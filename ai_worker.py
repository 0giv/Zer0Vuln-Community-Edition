import sys
import os
# Add Zer0Vuln to path so internal imports like 'modules.soar' work for the worker
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "Zer0Vuln"))

import asyncio
import json
import re
import logging
import aio_pika
import os
from datetime import datetime
from ai.utils import load_ai_config, analyze_with_ai, save_ai_results, queue_soar_action
from ai.intel import get_threat_intel_summary
from core import mq as mq_utils

# Workers can also trigger SOAR actions
from modules.soar.soar import SOARAutomation, SOARConfig

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("AI-Worker")

WORKER_TYPE = os.getenv("WORKER_TYPE", "automation").lower()
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq/")

# Confidence floor for keeping a finding as a CRITICAL "insight".
# Small local LLMs (e.g. llama3.2:3b) over-flag, so we drop low-confidence noise.
CRITICAL_CONFIDENCE_THRESHOLD = float(os.getenv("AI_CRIT_CONF", "0.6"))
SUSPICIOUS_CONFIDENCE_THRESHOLD = float(os.getenv("AI_SUS_CONF", "0.75"))

# Prompts Mapping
# IMPORTANT: Force a strict JSON verdict so we can drop low-confidence /
# benign findings before saving them as "AI Insights". The model otherwise
# floods the UI with false-positive criticals.
PROMPTS = {
    "automation": """You are a senior SOC analyst triaging telemetry. Be strict. Most logs are benign noise (routine logons, service checks, dev activity). Only escalate when a SPECIFIC, CONCRETE indicator of attack is present in the log.

A finding is CRITICAL only if AT LEAST ONE is clearly evidenced in the log:
- Confirmed credential theft / dumping (LSASS access, mimikatz, registry SAM)
- Active lateral movement with sensitive accounts (psexec, wmic /node, RDP from unusual host)
- Known-bad indicator hit (malware family, C2 IP/domain, ransomware extension)
- Privilege escalation attempt (token impersonation, UAC bypass, SeDebugPrivilege abuse)
- Data exfiltration (large outbound transfer, archive uploaded to external host)
- Adversary persistence (suspicious scheduled task, registry Run key, service install)

Default to NOT_CRITICAL. Do NOT flag generic warnings, single failed logon, normal admin actions, missing optional fields, or benign event IDs. If unsure, choose NOT_CRITICAL.

Return ONLY a single JSON object, no prose, no markdown fences:
{{"verdict":"CRITICAL|SUSPICIOUS|NOT_CRITICAL","severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","confidence":<0.0-1.0>,"indicator":"<MITRE ID + short label or 'none'>","summary":"<one sentence, <=180 chars>","recommended_action":"MONITOR|INVESTIGATE|ISOLATE_HOST|BLOCK_IP|KILL_PROCESS|DISABLE_USER|QUARANTINE_FILE"}}

LOGS:
{log_text}
""",
    "manual": """You are a senior SOC analyst performing a deep investigation on this telemetry batch. Be honest: if data is benign or insufficient, say so plainly instead of inventing threats.

Return ONLY a single JSON object, no prose, no markdown fences:
{{"verdict":"CRITICAL|SUSPICIOUS|NOT_CRITICAL|INSUFFICIENT_DATA","severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","confidence":<0.0-1.0>,"kill_chain_stage":"recon|delivery|exploitation|installation|c2|actions|none","techniques":["<MITRE ATT&CK ID>"],"iocs":["<ip|hash|domain|path>"],"summary":"<2-4 sentence technical narrative>","next_steps":["<concrete analyst step>"]}}

LOGS:
{log_text}
""",
    "defensive": """You are a SOAR response advisor. Recommend a defensive action ONLY if the threat is clear and high-confidence. If unclear, recommend MONITOR.

Return ONLY a single JSON object, no prose, no markdown fences:
{{"verdict":"ACT|MONITOR|IGNORE","severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","confidence":<0.0-1.0>,"action":"BLOCK_IP|KILL_PROCESS|RESTART_SERVICE|ISOLATE_HOST|DISABLE_USER|QUARANTINE_FILE|MONITOR","target":"<IP/PID/Username/Path or 'none'>","reason":"<one sentence justification>"}}

LOGS:
{log_text}
"""
}


def _extract_json(text: str):
    """Best-effort extraction of the first JSON object from an LLM response.
    Handles models that wrap JSON in prose or markdown fences."""
    if not text:
        return None
    # Strip code fences
    cleaned = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    # Find first { ... matching } via brace counting
    start = cleaned.find('{')
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(cleaned)):
        c = cleaned[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                blob = cleaned[start:i+1]
                try:
                    return json.loads(blob)
                except Exception:
                    return None
    return None


def _format_insight(verdict: dict, prefix: str) -> str:
    """Render a verdict JSON into a human-readable single-line insight."""
    sev = (verdict.get('severity') or 'INFO').upper()
    conf = verdict.get('confidence')
    summary = verdict.get('summary') or ''
    indicator = verdict.get('indicator') or verdict.get('kill_chain_stage') or ''
    action = verdict.get('recommended_action') or verdict.get('action') or ''
    parts = [f"[{prefix}]", f"[{sev}]"]
    if isinstance(conf, (int, float)):
        parts.append(f"conf={conf:.2f}")
    if indicator and indicator != 'none':
        parts.append(f"({indicator})")
    parts.append(summary)
    if action and action not in ('MONITOR', 'none'):
        parts.append(f"-> {action}")
    return ' '.join(p for p in parts if p)

# Queue Mapping
QUEUES = {
    "automation": mq_utils.AI_AUTOMATION,
    "manual": mq_utils.AI_MANUAL,
    "defensive": mq_utils.AI_SOAR
}

# SOAR Automation Instance (for Defensive Worker)
soar = SOARAutomation(SOARConfig())

async def handle_automation(agent, table, data, api_key, endpoint):
    log_text = json.dumps(data, indent=2)
    raw = await asyncio.to_thread(analyze_with_ai, api_key, log_text, PROMPTS["automation"], endpoint, agent=agent)

    verdict = _extract_json(raw) or {}
    v = (verdict.get('verdict') or '').upper()
    sev = (verdict.get('severity') or '').upper()
    try:
        conf = float(verdict.get('confidence') or 0)
    except Exception:
        conf = 0.0

    intel_match = await asyncio.to_thread(get_threat_intel_summary, log_text)

    # Gate: keep only items the model is reasonably sure about, OR a confirmed
    # global threat-intel hit (those bypass model uncertainty).
    is_critical = (v == 'CRITICAL' and sev in ('CRITICAL', 'HIGH') and conf >= CRITICAL_CONFIDENCE_THRESHOLD)
    is_suspicious = (v == 'SUSPICIOUS' and conf >= SUSPICIOUS_CONFIDENCE_THRESHOLD)

    if not (is_critical or is_suspicious or intel_match):
        logger.info(f"[.] Skipped non-critical (Automation) for {agent}/{table} verdict={v} sev={sev} conf={conf}")
        return

    summary_line = _format_insight(verdict, "AUTO") if verdict else f"[AUTO] {raw[:300]}"
    if intel_match:
        summary_line = f"{summary_line}\n[!!] GLOBAL THREAT INTEL MATCH: {intel_match}"

    logger.info(f"[!] CRITICAL (Automation) for {agent}: {summary_line[:120]}")
    result_entry = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'source_file': f"Realtime_{table}",
        'critical_summary': summary_line,
        'source_data': log_text,
    }
    try:
        await asyncio.to_thread(save_ai_results, agent, [result_entry])
    except Exception as e:
        logger.error(f"[!] Automation save FAILED agent={agent} table={table}: {e}")

async def handle_manual(agent, table, data, api_key, endpoint):
    # `data` may be a single row (dict) or a batch (list of rows). The server
    # batches manual jobs to ~10 rows per Ollama call to keep ingest tractable.
    batch_size = len(data) if isinstance(data, list) else 1
    log_text = json.dumps(data, indent=2, default=str)
    logger.info(f"[*] Manual analysis START agent={agent} table={table} batch={batch_size}")

    raw = await asyncio.to_thread(analyze_with_ai, api_key, log_text, PROMPTS["manual"], endpoint, agent=agent)

    verdict = _extract_json(raw) or {}
    if verdict:
        summary_line = _format_insight(verdict, f"MANUAL x{batch_size}")
        techniques = verdict.get('techniques') or []
        iocs = verdict.get('iocs') or []
        next_steps = verdict.get('next_steps') or []
        extras = []
        if techniques: extras.append(f"techniques={','.join(map(str, techniques))}")
        if iocs:       extras.append(f"iocs={','.join(map(str, iocs))}")
        if next_steps: extras.append("next=" + " | ".join(map(str, next_steps)))
        if extras:
            summary_line = f"{summary_line}\n  {' | '.join(extras)}"
    else:
        # Manual scans always save SOMETHING (user explicitly requested it)
        summary_line = f"[MANUAL DEEP SCAN x{batch_size}] {raw[:1500] if raw else 'No response from AI service.'}"

    result_entry = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'source_file': f"Manual_{table}",
        'critical_summary': summary_line,
        'source_data': log_text,
    }
    try:
        await asyncio.to_thread(save_ai_results, agent, [result_entry])
        logger.info(f"[*] Manual analysis SAVED agent={agent} table={table} batch={batch_size}")
    except Exception as e:
        logger.error(f"[!] Manual save FAILED agent={agent} table={table}: {e}")

# Actions the defensive AI is allowed to dispatch autonomously. Anything else
# (e.g. DELETE_FILE, RUN_CMD) requires a human in the loop and is downgraded to
# a recorded recommendation only.
AUTONOMOUS_ACTIONS = {
    "BLOCK_IP",
    "KILL_PROCESS",
    "RESTART_SERVICE",
    "ISOLATE_HOST",
    "DISABLE_USER",
    "QUARANTINE_FILE",
    "SUSPEND_PROCESS",
    "LOGOFF_USER",
    "CONTAINER_ISOLATE",
    "CONTAINER_STOP",
    "CONTAINER_KILL",
}

# Confidence required before the AI is allowed to actually trigger the action.
# Higher than the "save insight" floor so the system is stricter about acting
# than about flagging.
AUTONOMOUS_ACTION_CONFIDENCE = float(os.getenv("AI_AUTO_ACT_CONF", "0.75"))


async def handle_defensive(agent, table, data, api_key, endpoint):
    log_text = json.dumps(data, indent=2)
    raw = await asyncio.to_thread(analyze_with_ai, api_key, log_text, PROMPTS["defensive"], endpoint, agent=agent)

    verdict = _extract_json(raw) or {}
    v = (verdict.get('verdict') or '').upper()
    try:
        conf = float(verdict.get('confidence') or 0)
    except Exception:
        conf = 0.0

    # Only persist an actionable defensive recommendation; ignore MONITOR noise.
    if v != 'ACT' or conf < CRITICAL_CONFIDENCE_THRESHOLD:
        logger.info(f"[.] Skipped non-actionable (Defensive) for {agent}/{table} verdict={v} conf={conf}")
        return

    # IMPORTANT: SoarHub UI scans for the "[AI DEFENSIVE ADVICE]" marker — the
    # prefix here is load-bearing, do not rename without updating SoarHub.tsx.
    summary_line = _format_insight(verdict, "AI DEFENSIVE ADVICE")
    action = (verdict.get('action') or '').upper()
    target = verdict.get('target') or ''
    if target and target != 'none':
        summary_line = f"{summary_line} target={target}"

    # Try to take real autonomous action when the model is confident enough and
    # the requested action is on the safe-list. Anything else stays advisory.
    auto_dispatched = False
    if (
        action in AUTONOMOUS_ACTIONS
        and conf >= AUTONOMOUS_ACTION_CONFIDENCE
        and target
        and target != 'none'
    ):
        ok = await asyncio.to_thread(
            queue_soar_action,
            agent,
            action.lower(),
            str(target),
            f"AI auto-action conf={conf:.2f} reason={verdict.get('reason') or ''}".strip(),
        )
        auto_dispatched = ok
        if ok:
            summary_line = f"{summary_line} | AUTO-DISPATCHED {action}"
            logger.warning(f"[!!] AUTO-ACTION {action} target={target} agent={agent} conf={conf}")
        else:
            summary_line = f"{summary_line} | AUTO-DISPATCH FAILED"

    logger.info(f"[?] Defensive Recommendation for {agent}: {summary_line[:120]}")
    result_entry = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'source_file': "AI_DEFENSIVE_AUTO" if auto_dispatched else "AI_DEFENSIVE_ADVICE",
        'critical_summary': summary_line,
        'source_data': log_text,
    }
    try:
        await asyncio.to_thread(save_ai_results, agent, [result_entry])
    except Exception as e:
        logger.error(f"[!] Defensive save FAILED agent={agent} table={table}: {e}")

# AI processing lock to prevent multiple concurrent local LLM calls in one worker
ai_semaphore = asyncio.Semaphore(1)

async def process_message(message: aio_pika.IncomingMessage):
    async with message.process():
        # Sequential processing per worker to save CPU
        async with ai_semaphore:
            try:
                payload = json.loads(message.body.decode())
                agent = payload.get("agent")
                table = payload.get("table")
                data  = payload.get("data")
                
                if not agent or not data:
                    return

                logger.info(f"[*] Starting {WORKER_TYPE} task for agent: {agent}, table: {table}")
                cfg = await load_ai_config(agent)
                api_key = cfg.get('api_key', 'ollama')
                endpoint = cfg.get('endpoint')

                if WORKER_TYPE == "automation":
                    await handle_automation(agent, table, data, api_key, endpoint)
                elif WORKER_TYPE == "manual":
                    await handle_manual(agent, table, data, api_key, endpoint)
                elif WORKER_TYPE == "defensive":
                    await handle_defensive(agent, table, data, api_key, endpoint)

                # Small sleep to let the CPU breathe between long LLM calls
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"[!] Error processing message in {WORKER_TYPE}: {e}")

async def main():
    queue_name = QUEUES.get(WORKER_TYPE, mq_utils.AI_AUTOMATION)
    logger.info(f"[*] Starting AI Worker [{WORKER_TYPE.upper()}], queue: {queue_name}")
    
    connection = None
    while not connection:
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
        except Exception as e:
            logger.error(f"[!] Connection to {RABBITMQ_URL} failed, retrying in 5s...")
            await asyncio.sleep(5)

    async with connection:
        channel = await connection.channel()
        # Conservative prefetch to prevent queue hoarding and CPU spikes
        await channel.set_qos(prefetch_count=1)
        queue = await channel.declare_queue(queue_name, durable=True)
        await queue.consume(process_message)
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
