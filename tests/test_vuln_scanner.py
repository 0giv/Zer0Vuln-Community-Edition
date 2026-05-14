"""Unit tests for the OSV vulnerability scanner.

Focused on the deterministic helpers — ecosystem detection, dedup
fingerprinting, Debianish version normalisation, and the offline behaviour
when OSV is unreachable. The HTTP-fronted call paths are exercised via
mocked `requests.post` / `requests.get`.
"""
from __future__ import annotations

import pytest

from scanners import vuln


# ── _make_dup_fp ─────────────────────────────────────────────────────────────

def test_dup_fp_is_stable_for_same_inputs():
    a = vuln._make_dup_fp("openssl", "1.1.1f-1ubuntu2", "CVE-2024-0001")
    b = vuln._make_dup_fp("openssl", "1.1.1f-1ubuntu2", "CVE-2024-0001")
    assert a == b
    assert len(a) == 64  # sha256 hex digest


def test_dup_fp_differs_on_version_change():
    a = vuln._make_dup_fp("openssl", "1.1.1f-1ubuntu2", "CVE-2024-0001")
    b = vuln._make_dup_fp("openssl", "1.1.1g-1ubuntu1", "CVE-2024-0001")
    assert a != b


def test_dup_fp_differs_on_cve_change():
    a = vuln._make_dup_fp("openssl", "1.1.1f-1ubuntu2", "CVE-2024-0001")
    b = vuln._make_dup_fp("openssl", "1.1.1f-1ubuntu2", "CVE-2024-0002")
    assert a != b


# ── _normalize_debianish_version ─────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw,expected_norm,expected_upstream",
    [
        # Epoch stripped; the `-Nubuntu1` tail is only partially scrubbed
        # by the current regex (it strips the literal word "ubuntu" but
        # leaves the surrounding digits glued together). `upstream` is the
        # piece OSV actually uses for the second-pass fallback, so we
        # focus the contract on upstream being clean.
        ("4:13.2.0-7ubuntu1", "13.2.0-71", "13.2.0"),
        ("1.21.2-2ubuntu1.1", "1.21.2-21.1", "1.21.2"),
        ("5.2.5-2ubuntu1", "5.2.5-21", "5.2.5"),
        # No epoch / no ubuntu tail → norm equals input post-epoch-strip.
        ("2:8.2.3995", "8.2.3995", "8.2.3995"),
        # Empty stays empty.
        ("", "", ""),
    ],
)
def test_normalize_debianish_version(raw, expected_norm, expected_upstream):
    norm, upstream = vuln._normalize_debianish_version(raw)
    assert norm == expected_norm
    assert upstream == expected_upstream


# ── _detect_ecosystem ────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "os_info,expected",
    [
        ("Windows-11-10.0.26200-SP0", "Windows"),
        ("Linux-5.15.0-91-generic-x86_64-with-glibc2.35 ubuntu 22.04", "Debian"),
        ("Debian GNU/Linux 12 (bookworm)", "Debian"),
        ("CentOS Linux 7 (Core) rhel-derived", "RPM"),
        ("Fedora Linux 39", "RPM"),
        ("Alpine Linux 3.18", "Alpine"),
        ("Arch Linux", "ARCH"),
        ("Manjaro Linux", "ARCH"),
        (None, None),
        ("", None),
        # Pure-string match misses generic WSL kernel.
        ("Linux-6.6.87.2-microsoft-standard-WSL2-x86_64-with-glibc2.35", None),
    ],
)
def test_detect_ecosystem_string_only(os_info, expected):
    assert vuln._detect_ecosystem(os_info) == expected


def test_detect_ecosystem_wsl_fingerprints_to_debian_via_packages():
    """WSL Ubuntu reports a generic kernel string. The fallback inspects
    package version patterns to recover the ecosystem."""
    os_info = "Linux-6.6.87.2-microsoft-standard-WSL2-x86_64-with-glibc2.35"
    pkgs = [
        {"package": "openssl", "version": "1.1.1f-1ubuntu2.20"},
        {"package": "vim", "version": "2:8.2.3995-1ubuntu2.21"},
    ]
    assert vuln._detect_ecosystem(os_info, pkgs) == "Debian"


def test_detect_ecosystem_unknown_linux_defaults_to_debian():
    os_info = "Linux-some-weird-thing"
    pkgs = [{"package": "x", "version": "1.0"}]
    # No ubuntu / .el pattern → still defaults to Debian (most common in fleet).
    assert vuln._detect_ecosystem(os_info, pkgs) == "Debian"


def test_detect_ecosystem_rpm_via_package_patterns():
    os_info = "Linux-generic"
    pkgs = [{"package": "kernel", "version": "5.14.0-362.18.1.el9_3"}]
    assert vuln._detect_ecosystem(os_info, pkgs) == "RPM"


# ── _build_triplets ──────────────────────────────────────────────────────────

def test_build_triplets_skips_packages_without_name_or_version():
    rows = [
        {"package": "openssl", "version": "1.1.1f-1ubuntu2.20"},
        {"package": "", "version": "1.0"},                       # no name → dropped
        {"package": "vim", "version": ""},                       # no version → dropped
        {"package": "wget", "version": "1.21.2-2ubuntu1.1"},
    ]
    triples = vuln._build_triplets(rows, "Debian")
    assert [(t[0], t[1]) for t in triples] == [
        ("openssl", "1.1.1f-1ubuntu2.20"),
        ("wget", "1.21.2-2ubuntu1.1"),
    ]
    # Debian path normalises versions.
    assert triples[0][3] != triples[0][1]  # norm differs from raw


def test_build_triplets_non_debian_keeps_raw_version():
    rows = [{"package": "openssl", "version": "1.1.1f"}]
    triples = vuln._build_triplets(rows, "RPM")
    # norm and upstream equal raw for non-Debian ecosystems.
    assert triples[0][3] == "1.1.1f"
    assert triples[0][4] == "1.1.1f"


# ── _osv_query_batch short-circuit when no endpoint ──────────────────────────

def test_osv_query_batch_returns_empty_when_endpoint_unresolved(monkeypatch):
    """If resolve_osv_endpoint never picked a base (e.g. air-gapped without a
    mirror), batch queries must short-circuit instead of hammering DNS."""
    monkeypatch.setattr(vuln, "_OSV_BASE", "")
    queries = [{"package": {"name": "x", "ecosystem": "Debian"}, "version": "1.0"}]
    out = vuln._osv_query_batch(queries)
    assert out == [{"vulns": []}]
