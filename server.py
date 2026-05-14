import asyncio
import struct
import os
import argparse
import requests
import sys
import mysql.connector
import json
import hashlib
import re
import time
from datetime import datetime
from sanic import Sanic
from sanic.response import json as sanic_json, text as sanic_text
from dotenv import load_dotenv
import pathlib
import aio_pika

ENV_PATH = pathlib.Path(".env")
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)



debug = True


SERVER_IP = os.getenv('INGEST_BIND', '0.0.0.0')
SERVER_PORT = int(os.getenv('INGEST_PORT', '5001'))
BUFFER_SIZE = 16 * 1024

DB_HOST = os.getenv('DB_HOST', '127.0.0.1')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'my-secret-pw')
DB_PORT = int(os.getenv('DB_PORT', '3306'))

LICENSE_API_BASE_URL = os.getenv('LICENSE_API_BASE_URL', 'http://host.docker.internal:5099')


REQUIRE_LICENSE_HEADER = os.getenv("REQUIRE_LICENSE_HEADER", "true").lower() in ("1", "true", "yes")
LICENSE_HEADER_NAME    = os.getenv("LICENSE_HEADER_NAME", "X-License-Key")

DEDUP_TABLES = {
    "critical_files", "portscan_result", "packages",
    "vulnerabilities_report", "siem_events", "events_alert", "soar_actions",
    "fim_data", "registry_logs", "network_connections", "process_events", "hardware_inventory", "security_audit", "docker_containers",
    "software_inventory", "network_inventory"
}

ALLOWED_TABLES = {
    "critical_files", "portscan_result", "resource_usage",
    "disk_usage", "packages", "vulnerabilities_report",
    "siem_events", "events_alert", "soar_actions",
    "fim_data", "registry_logs", "network_connections", "process_events", "hardware_inventory", "security_audit", "docker_containers",
    "software_inventory", "network_inventory"
}

LICENSE_STATE = {
    "license_key": None,
    "fernet_key": None,
    "license_types": [],
    "expires_at": None,
    "is_active": False,
}

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq/")

RECENT_AI_TASKS = {}
AI_DEDUP_WINDOW = 30


def connect_db(db_name):
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        port=DB_PORT,
        database=db_name,
    )

def _sanitize_db_name(agent: str) -> str:
    safe = re.sub(r'[^A-Za-z0-9_]', '_', agent or 'agent')
    safe = safe.strip('_') or 'agent'
    return f"{safe}_db"

def create_agent_db_if_not_exists(agent: str) -> str:
    db_name = _sanitize_db_name(agent)
    conn = mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        port=DB_PORT
    )
    cursor = conn.cursor()
    try:
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")
        conn.commit()
    finally:
        cursor.close()
        conn.close()
    return db_name

def create_tables_if_not_exist(db_name):
    conn = connect_db(db_name)
    cursor = conn.cursor()
    try:
        try:
            with open("init.sql", "r", encoding="utf-8") as f:
                sql = f.read()
            for statement in sql.split(';'):
                stmt = statement.strip()
                if stmt:
                    try:
                        cursor.execute(stmt)
                    except mysql.connector.Error as e:
                        print(f"[!] SQL Execution Error: {e}")
        except FileNotFoundError:
            pass

        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS agent_info (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    agent_name VARCHAR(255) NOT NULL,
                    public_ip VARCHAR(45),
                    os_info VARCHAR(255) NULL,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_agent (agent_name)
                ) ENGINE=InnoDB
            """)
            try:
                cursor.execute("ALTER TABLE agent_info ADD COLUMN IF NOT EXISTS os_info VARCHAR(255) NULL")
            except mysql.connector.Error:
                pass
        except mysql.connector.Error as e:
            print(f"[!] Agent info table creation/alter error: {e}")

        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS ingest_fingerprint (
                    table_name VARCHAR(64) NOT NULL,
                    fp CHAR(64) NOT NULL,
                    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (table_name, fp)
                ) ENGINE=InnoDB
            """)
        except mysql.connector.Error as e:
            print(f"[!] Fingerprint table creation error: {e}")

        conn.commit()
    finally:
        cursor.close()
        conn.close()

def _json_default(o):
    if isinstance(o, datetime):
        return o.isoformat()
    return str(o)

def compute_fingerprint(table: str, item: dict) -> str:
    clean = {k: v for k, v in item.items() if k not in ("id", "sent")}
    blob = json.dumps(clean, sort_keys=True, separators=(",", ":"), default=_json_default).encode("utf-8")
    return hashlib.sha256(table.encode() + b"|" + blob).hexdigest()

def compute_ai_fingerprint(table: str, item: dict) -> str:
    """Fingerprint that ignores high-entropy fields like timestamps to group similar logs for AI."""
    ignore = {"id", "sent", "timestamp", "@timestamp", "TimeGenerated", "time", "created_at", "PID", "ProcessID", "process_id"}
    data = {k: v for k, v in item.items() if k not in ignore}
    blob = json.dumps(data, sort_keys=True, separators=(",", ":"), default=_json_default).encode("utf-8")
    return hashlib.sha256(table.encode() + b"|AI|" + blob).hexdigest()

def update_agent_info(agent: str, public_ip: str, os_info: str = None, hostname: str = None, mac_address: str = None):
    db_name = create_agent_db_if_not_exists(agent)
    create_tables_if_not_exist(db_name)
    conn = connect_db(db_name)
    cursor = conn.cursor()
    try:
        for col, ddl in (
            ("hostname", "ALTER TABLE agent_info ADD COLUMN hostname VARCHAR(255) NULL"),
            ("mac_address", "ALTER TABLE agent_info ADD COLUMN mac_address VARCHAR(48) NULL"),
        ):
            try:
                cursor.execute(ddl)
            except Exception:
                pass
        cursor.execute("""
            INSERT INTO agent_info (agent_name, public_ip, os_info, hostname, mac_address, last_seen)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
            public_ip = VALUES(public_ip),
            os_info = VALUES(os_info),
            hostname = COALESCE(VALUES(hostname), hostname),
            mac_address = COALESCE(VALUES(mac_address), mac_address),
            last_seen = VALUES(last_seen)
        """, (agent, public_ip, os_info, hostname, mac_address, datetime.now()))
        conn.commit()
    except Exception as e:
        print(f"! Error updating agent info: {e}")
    finally:
        cursor.close()
        conn.close()

from core import mq as mq_utils
import core.opensearch as os_utils

async def publish_to_ai_queue(agent: str, table: str, item: dict):
    """Publish a log entry to RabbitMQ for both automation and defensive (SOAR) analysis"""
    await mq_utils.publish_to_queue(mq_utils.AI_AUTOMATION, agent, table, item)
    
    if table == "events_alert":
        await mq_utils.publish_to_queue(mq_utils.AI_SOAR, agent, table, item)
        print(f"[AI-Trigger] Published {table} task for {agent} to SOAR (Defensive) queue.")

def _parse_os_info_tail(os_info: str | None):
    """Agent appends |HOST=<hostname>|MAC=<addr> to OS_INFO so the server
    can recover the real machine identifiers without changing the TCP
    wire format. Returns (clean_os_info, hostname, mac_address)."""
    if not os_info or "|" not in os_info:
        return os_info, None, None
    parts = os_info.split("|")
    base = parts[0]
    hostname = mac = None
    for p in parts[1:]:
        if p.startswith("HOST="):
            hostname = p[5:].strip() or None
        elif p.startswith("MAC="):
            mac = p[4:].strip() or None
    return base, hostname, mac


async def insert_data(agent: str, table: str, data: list, public_ip: str = None, os_info: str = None):
    db_name = create_agent_db_if_not_exists(agent)
    create_tables_if_not_exist(db_name)

    clean_os, hostname, mac_address = _parse_os_info_tail(os_info)
    if public_ip or clean_os:
        update_agent_info(agent, public_ip, clean_os, hostname=hostname, mac_address=mac_address)

    conn = connect_db(db_name)
    cursor = conn.cursor()
    try:
        if table not in ALLOWED_TABLES:
            print(f"[!] Unknown table '{table}' received. Skipping.")
            return

        if table in {"resource_usage", "disk_usage", "critical_files", "network_connections", "hardware_inventory", "docker_containers"}:
            cursor.execute(f"DELETE FROM `{table}`")

        for item in data:
            item = dict(item)
            item.pop("id", None)
            item["sent"] = False

            if table in DEDUP_TABLES:
                fp = compute_fingerprint(table, item)
                cursor.execute(
                    "INSERT IGNORE INTO ingest_fingerprint (table_name, fp) VALUES (%s, %s)",
                    (table, fp)
                )
                if cursor.rowcount == 0:
                    continue

            keys = ', '.join(f"`{k}`" for k in item.keys())
            values = ', '.join(['%s'] * len(item))
            sql = f"INSERT INTO `{table}` ({keys}) VALUES ({values})"
            cursor.execute(sql, list(item.values()))

            if table in {"siem_events", "events_alert"}:
                ai_fp = compute_ai_fingerprint(table, item)
                now = time.time()
                cache_key = (agent, table, ai_fp)
                
                last_time = RECENT_AI_TASKS.get(cache_key, 0)
                if now - last_time > AI_DEDUP_WINDOW:
                    RECENT_AI_TASKS[cache_key] = now
                    pub_task = asyncio.create_task(publish_to_ai_queue(agent, table, item))
                    print(f"[AI-Trigger] Published {table} task for {agent} to RabbitMQ.")

                    
                    if len(RECENT_AI_TASKS) > 1000:
                        RECENT_AI_TASKS.clear() 

            asyncio.create_task(os_utils.index_log(agent, table, item))

        conn.commit()
    except Exception as e:
        if debug:
            print(f"[!] Data insertion error: {e}")
    finally:
        cursor.close()
        conn.close()


async def recv_all(reader, length):
    data = b''
    while len(data) < length:
        more = await reader.read(length - len(data))
        if not more:
            raise EOFError(f"Expected {length} bytes but received {len(data)} bytes.")
        data += more
    return data

async def handle_client(reader, writer):
    try:
        raw_len = await recv_all(reader, 4)
        (agent_name_len,) = struct.unpack('!I', raw_len)
        agent_name = (await recv_all(reader, agent_name_len)).decode('utf-8')

        raw_ip_len = await recv_all(reader, 4)
        (ip_len,) = struct.unpack('!I', raw_ip_len)
        public_ip = (await recv_all(reader, ip_len)).decode('utf-8')

        raw_os_len = await recv_all(reader, 4)
        (os_len,) = struct.unpack('!I', raw_os_len)
        os_info = (await recv_all(reader, os_len)).decode('utf-8')

        raw_fname_len = await recv_all(reader, 4)
        (fname_len,) = struct.unpack('!I', raw_fname_len)
        fname = (await recv_all(reader, fname_len)).decode('utf-8')

        raw_fsize = await recv_all(reader, 8)
        (fsize,) = struct.unpack('!Q', raw_fsize)

        data_bytes = await recv_all(reader, fsize)
        try:
            data = json.loads(data_bytes.decode('utf-8'))
        except Exception as e:
            if debug:
                print(f"[ERROR] JSON decode failed from {agent_name}@{public_ip}: {e}")
                return

        await insert_data(agent_name, fname.replace(".json", ""), data, public_ip, os_info)
        if debug:
            print(f"[INFO] Data received from {agent_name}@{public_ip} ({os_info}) - File: {fname}, Size: {fsize} bytes")

    except Exception as e:
        if debug:
            print(f"[ERROR] Client handling failed: {e}")
    finally:
        writer.close()
        await writer.wait_closed()


def _check_auth_header(request):
    if not REQUIRE_LICENSE_HEADER:
        return True
    provided = request.headers.get(LICENSE_HEADER_NAME)
    return bool(provided) and provided == LICENSE_STATE.get("license_key")

def _candidate_license_urls(base: str) -> list[tuple[str, str]]:
    """
    Denenecek (base, path) ikilileri:
    - host candidate: verilen base, localhost→127.0.0.1 varyantı
    - path candidate: /license_status ve /license/status
    """
    base = base.rstrip('/')
    hosts = [base]
    if 'localhost' in base:
        hosts.append(base.replace('localhost', '127.0.0.1'))
    elif '127.0.0.1' in base:
        hosts.append(base.replace('127.0.0.1', 'localhost'))
    paths = ['/license_status', '/license/status']
    out = []
    for h in hosts:
        for p in paths:
            out.append((h, p))
    seen = set()
    uniq = []
    for b, p in out:
        key = (b, p)
        if key not in seen:
            seen.add(key)
            uniq.append(key)
    return uniq

def fetch_license_state(license_key: str, retries: int = 3, backoff_sec: float = 0.7) -> bool:

    sess = requests.Session()
    sess.headers.update({"Connection": "close", "Accept": "application/json"})
    proxies = {"http": None, "https": None}

    last_err = None
    cands = _candidate_license_urls(LICENSE_API_BASE_URL)
    for attempt in range(1, retries + 1):
        for base, path in cands:
            try:
                url = f"{base}{path}"
                print(f"[*] License check attempt {attempt}/{retries} → {url}")
                resp = sess.get(
                    url,
                    params={"license_key": license_key, "reveal_key": "true"},
                    timeout=(3.0, 8.0),
                    allow_redirects=True,
                    proxies=proxies,
                )
                if resp.status_code == 404:
                    print("[!] License not found (404).")
                    LICENSE_STATE.update({
                        "license_key": license_key,
                        "is_active": False,
                        "fernet_key": None,
                        "license_types": [],
                        "expires_at": None
                    })
                    return False

                resp.raise_for_status()
                data = resp.json() if resp.content else {}

                is_active = bool(data.get("is_active"))
                types = data.get("license_types") or ([data.get("license_type")] if data.get("license_type") else [])

                LICENSE_STATE.update({
                    "license_key": license_key,
                    "is_active": is_active,
                    "fernet_key": data.get("fernet_key"),
                    "license_types": [t for t in types if t],
                    "expires_at": data.get("expires_at")
                })

                if is_active:
                    print(f"[*] License OK @ {url} Types={LICENSE_STATE['license_types']} ExpiresAt={LICENSE_STATE['expires_at']}")
                    if LICENSE_STATE["fernet_key"]:
                        print("[*] Fernet key received from License API.")
                    else:
                        print("[!] License active BUT fernet_key missing (ensure reveal_key=true).")
                    return True
                else:
                    print("[!] License inactive or expired.")
                    return False

            except requests.exceptions.RequestException as e:
                last_err = e
                print(f"[!] License call failed @ {base}{path}: {e}")

        if attempt < retries:
            time.sleep(backoff_sec * attempt)

    print(f"[!] License validation failed after {retries} attempts: {last_err}")
    return False

def validate_license_key(license_key: str) -> bool:
    return fetch_license_state(license_key)

async def periodic_license_check(license_key, interval=600):
    while True:
        await asyncio.sleep(interval)
        print("[+] Checking license validity...")
        if not fetch_license_state(license_key):
            print("[-] License invalidated. Shutting down the server.")
            os._exit(1)





async def main(license_key: str):
    if not validate_license_key(license_key):
        print("[!] Invalid or inactive license key. Server cannot be started.")
        sys.exit(1)


    server = await asyncio.start_server(
        handle_client, SERVER_IP, SERVER_PORT,
        reuse_address=True, reuse_port=False
    )
    addr = server.sockets[0].getsockname()
    print(f"[*] TCP server listening on: {addr}")
    print(f"[*] Active license types: {LICENSE_STATE['license_types']}")
    masked = (LICENSE_STATE['fernet_key'][:6] + '...') if LICENSE_STATE['fernet_key'] else None
    print(f"[*] Fernet key (masked): {masked}")

    asyncio.create_task(periodic_license_check(license_key))

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AsyncIO Agent Data Collector Server")
    parser.add_argument('-l', '--license', help='License key required to start the server')
    args = parser.parse_args()
    
    license_key = args.license or os.getenv("LICENSE_KEY")
    
    if not license_key:
        print("[!] Error: License key not provided. Use --license or set LICENSE_KEY in .env")
        sys.exit(1)

    LICENSE_STATE["license_key"] = license_key
    print(f"[*] Using LICENSE_API_BASE_URL={LICENSE_API_BASE_URL} ")
    asyncio.run(main(license_key))
