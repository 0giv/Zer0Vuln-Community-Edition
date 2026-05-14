from __future__ import annotations

import os
import json
import time
import threading
import requests
from typing import Dict, Any, List, Optional, Union
from cryptography.fernet import Fernet, InvalidToken

import modules.db as _db


LICENSE_API_URL: str = os.getenv("LICENSE_API_URL", "http://127.0.0.1:5000")
LICENSE_KEY: Optional[str] = os.getenv("LICENSE_KEY")
FERNET_REFRESH_SEC: int = int(os.getenv("FERNET_REFRESH_SEC", "600"))

LICENSE_HEADER_NAME: str = "X-License-Key"
FERNET_ENDPOINT_PATH: str = "/license/fernet"

ENCRYPT_FIELDS_MAP: Dict[str, List[str]] = {
    "fim_data": ["path", "hash_sha256"],
    "registry_logs": ["hive", "key_path", "value_name", "value_data"],
    "network_connections": ["process_name", "local_addr", "remote_addr"],
    "process_events": ["name", "cmdline", "username"],
    "hardware_inventory": ["name", "serial_number"],
    "security_audit": ["finding", "details"]
}

_LOCK = threading.RLock()
__FERNET_OBJ: Optional[Fernet] = None
__FERNET_TS: float = 0.0
__FERNET_KEY_STR: Optional[str] = None

ENC_PREFIX = "enc::"


def set_license_config(
    license_key: Optional[str] = None,
    api_url: Optional[str] = None,
    header_name: Optional[str] = None,
    fernet_endpoint_path: Optional[str] = None,
    refresh_sec: Optional[int] = None,
) -> None:
    """
    Backward-compatible konfig setteri.
    Yeni akışta header/fernet endpoint kullanılmaz.
    """
    global LICENSE_KEY, LICENSE_API_URL, FERNET_REFRESH_SEC
    if license_key is not None:
        LICENSE_KEY = license_key
    if api_url is not None:
        LICENSE_API_URL = api_url
    if refresh_sec is not None:
        FERNET_REFRESH_SEC = max(60, int(refresh_sec))


def set_encrypt_fields_map(mapping: Dict[str, List[str]], *, merge: bool = False) -> None:
    """
    merge=False: (varsayılan) Haritayı komple değiştirir.
    merge=True:  Var olanla birleştirir (overwrite etmez).
    """
    global ENCRYPT_FIELDS_MAP
    if not merge:
        ENCRYPT_FIELDS_MAP = {k: list(dict.fromkeys(v)) for k, v in (mapping or {}).items()}
        return

    for table, fields in (mapping or {}).items():
        cur = ENCRYPT_FIELDS_MAP.get(table, [])
        ENCRYPT_FIELDS_MAP[table] = list(dict.fromkeys(cur + list(fields or [])))


def add_encrypted_fields(table: str, fields: List[str]) -> None:
    """Tek tablo için alan ekle (merge shortcut)."""
    set_encrypt_fields_map({table: fields}, merge=True)


def set_fernet_key(key: Union[str, bytes]) -> None:
    """
    Dışarıdan Fernet anahtarını enjekte etmek için.
    Agent lisans servisinden çekip buraya basabilir.
    """
    global __FERNET_OBJ, __FERNET_TS, __FERNET_KEY_STR
    if isinstance(key, bytes):
        key_bytes = key
        key_str = key.decode("utf-8")
    else:
        key_str = key
        key_bytes = key.encode("utf-8")

    cipher = Fernet(key_bytes)
    with _LOCK:
        __FERNET_OBJ = cipher
        __FERNET_TS = time.time()
        __FERNET_KEY_STR = key_str


def get_fernet_key() -> Optional[str]:
    with _LOCK:
        return __FERNET_KEY_STR


def has_key() -> bool:
    with _LOCK:
        return __FERNET_OBJ is not None


class ConfigError(RuntimeError):
    pass


def _require(value, name: str):
    if not value:
        raise ConfigError(f"{name} is required but not set.")
    return value


def _fetch_fernet_key_v2() -> str:
    """
    Dokümana uygun şekilde lisans servisinden fernet_key al:
      GET {LICENSE_API_URL}/license_status?license_key=...&reveal_key=true

    Beklenen JSON alanları:
      - is_active: bool
      - fernet_key: str (reveal_key=true ise)
    """
    base = _require(LICENSE_API_URL, "LICENSE_API_URL").rstrip("/")
    lkey = _require(LICENSE_KEY, "LICENSE_KEY")

    url = f"{base}/license_status"
    params = {"license_key": lkey, "reveal_key": "true"}

    r = requests.get(url, params=params, timeout=6)
    if r.status_code == 404:
        raise RuntimeError("License not found on server (404).")
    r.raise_for_status()
    data = r.json() or {}

    if not data.get("is_active", False):
        raise RuntimeError(f"License is inactive or expired. Expires at: {data.get('expires_at')}")

    key = data.get("fernet_key")
    if not key:
        raise RuntimeError("License server did not return 'fernet_key' (need reveal_key=true).")
    return key


def _get_fernet() -> Fernet:
    """
    Cache'li Fernet nesnesi döndürür. Süresi dolmuşsa/boşsa:
    - Dışarıdan set_fernet_key() ile gelen varsa onu kullanır (sadece refresh eşiği aşılmışsa yeniden set etmeyiz)
    - Aksi halde lisans servisinden /license_status ile anahtarı çeker.
    """
    global __FERNET_OBJ, __FERNET_TS, __FERNET_KEY_STR

    now = time.time()
    with _LOCK:
        if __FERNET_OBJ is not None and (now - __FERNET_TS) <= FERNET_REFRESH_SEC:
            return __FERNET_OBJ

    key_b64 = _fetch_fernet_key_v2()
    cipher = Fernet(key_b64.encode("utf-8") if isinstance(key_b64, str) else key_b64)

    with _LOCK:
        __FERNET_OBJ = cipher
        __FERNET_TS = now
        __FERNET_KEY_STR = key_b64
        return __FERNET_OBJ


def _should_encrypt(table: str, field: str) -> bool:
    fields = ENCRYPT_FIELDS_MAP.get(table) or []
    return field in fields


def encrypt_str(plaintext: str) -> str:
    """
    Tekil string'i şifrele (enc::<token>).
    """
    f = _get_fernet()
    token = f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
    return ENC_PREFIX + token


def decrypt_maybe(val: Union[str, bytes]) -> str:
    """
    Değer enc:: ile başlıyorsa çöz, yoksa string'e çevirip aynen döndür.
    Hatalı token varsa dokunmadan iade eder.
    """
    if isinstance(val, bytes):
        try:
            val = val.decode("utf-8")
        except Exception:
            return val.decode("utf-8", errors="ignore")

    if not isinstance(val, str):
        return str(val)

    if not val.startswith(ENC_PREFIX):
        return val

    token = val[len(ENC_PREFIX):].encode("utf-8")
    try:
        pt = _get_fernet().decrypt(token)
        return pt.decode("utf-8")
    except InvalidToken:
        return val


def _enc_value(v: Any) -> str:
    """
    Her türlü Python değerini JSON'a sar, şifrele, enc::<cipher> olarak döndür.
    """
    f = _get_fernet()
    payload = json.dumps(v, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = f.encrypt(payload).decode("utf-8")
    return ENC_PREFIX + ct


def _dec_value(v: Any) -> Any:
    """
    enc::<cipher> ise çöz, değilse olduğu gibi bırak.
    """
    if not isinstance(v, str) or not v.startswith(ENC_PREFIX):
        return v
    token = v[len(ENC_PREFIX):].encode("utf-8")
    try:
        pt = _get_fernet().decrypt(token)
        return json.loads(pt.decode("utf-8"))
    except (InvalidToken, json.JSONDecodeError):
        return v


def _encrypt_row(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in data.items():
        out[k] = _enc_value(v) if _should_encrypt(table, k) else v
    return out


def _decrypt_row(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in row.items():
        out[k] = _dec_value(v) if _should_encrypt(table, k) else v
    return out


def _decrypt_rows(table: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [_decrypt_row(table, r) for r in rows]


def insert_record_enc(table: str, data: dict):
    """insert_record'in şifreli versiyonu."""
    enc = _encrypt_row(table, data)
    return _db.insert_record(table, enc)


def delete_all_enc(table: str):
    """delete_all aynen çalışır; şifreleme gerektirmez."""
    return _db.delete_all(table)


def fetch_unsent_dec(table: str, limit: int = 100):
    """fetch_unsent -> dönen satırları çöz."""
    rows = _db.fetch_unsent(table, limit)
    dict_rows = [dict(r) for r in rows]
    return _decrypt_rows(table, dict_rows)


def mark_sent_enc(table: str, ids: list):
    """mark_sent aynen çalışır; şifreleme gerektirmez."""
    return _db.mark_sent(table, ids)


def fetch_one_dec(table: str, where: str = "1=1", params: tuple = (), order_by: Optional[str] = None):
    row = _db.fetch_one(table, where, params, order_by)
    return _decrypt_row(table, dict(row)) if row else None


def fetch_recent_dec(table: str, limit: int = 100):
    rows = _db.fetch_recent(table, limit)
    dict_rows = [dict(r) for r in rows]
    return _decrypt_rows(table, dict_rows)


def fetch_where_dec(
    table: str,
    where: str = "1=1",
    params: tuple = (),
    order_by: Optional[str] = None,
    limit: Optional[int] = None,
):
    rows = _db.fetch_where(table, where, params, order_by, limit)
    dict_rows = [dict(r) for r in rows]
    return _decrypt_rows(table, dict_rows)


def update_record_enc(table: str, data: dict, where: str, params: tuple = ()):
    enc = _encrypt_row(table, data)
    return _db.update_record(table, enc, where, params)
