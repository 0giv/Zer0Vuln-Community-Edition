"""Unit tests for threat-intel enrichment helpers (ai/intel.py).

We only run the offline-friendly bits. The OTX / VirusTotal calls are
no-ops without API keys, so this file's main job is to lock in that
behaviour — there should be ZERO outbound HTTP requests when API keys
are unset, regardless of how scary the log content looks.
"""
from __future__ import annotations

from ai import intel


def test_extract_indicators_pulls_public_ips_only():
    text = (
        "Connection from 8.8.8.8 to internal 192.168.1.5; "
        "another hop via 10.0.0.4 / 172.16.0.1 / 127.0.0.1 / 203.0.113.42"
    )
    ips, hashes = intel.extract_indicators(text)
    # Private + loopback IPs filtered out.
    assert "192.168.1.5" not in ips
    assert "10.0.0.4" not in ips
    assert "172.16.0.1" not in ips
    assert "127.0.0.1" not in ips
    # Public IPs kept.
    assert set(ips) == {"8.8.8.8", "203.0.113.42"}
    assert hashes == []


def test_extract_indicators_returns_empty_when_no_match():
    ips, hashes = intel.extract_indicators("nothing interesting here")
    assert ips == []
    assert hashes == []


def test_check_ip_otx_is_noop_without_key(monkeypatch):
    """Without OTX_API_KEY the helper must return None and NEVER hit the wire."""
    monkeypatch.setattr(intel, "OTX_API_KEY", "")

    called = []

    def fail(*_a, **_kw):
        called.append(True)
        raise AssertionError("network call leaked despite empty API key")

    monkeypatch.setattr(intel.requests, "get", fail)

    assert intel.check_ip_otx("8.8.8.8") is None
    assert called == []


def test_check_hash_vt_is_noop_without_key(monkeypatch):
    monkeypatch.setattr(intel, "VT_API_KEY", "")

    def fail(*_a, **_kw):
        raise AssertionError("network call leaked despite empty API key")

    monkeypatch.setattr(intel.requests, "get", fail)

    assert intel.check_hash_vt("d41d8cd98f00b204e9800998ecf8427e") is None


def test_get_threat_intel_summary_returns_none_when_all_lookups_skip(monkeypatch):
    """With both API keys empty, the consolidated summary must be None — no
    'Indicator [...]: ...' rows fabricated."""
    monkeypatch.setattr(intel, "OTX_API_KEY", "")
    monkeypatch.setattr(intel, "VT_API_KEY", "")

    out = intel.get_threat_intel_summary(
        "outbound to 8.8.8.8 and hash d41d8cd98f00b204e9800998ecf8427e"
    )
    assert out is None
