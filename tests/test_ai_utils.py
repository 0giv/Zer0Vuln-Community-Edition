"""Unit tests for the AI worker helpers.

The expensive paths (Ollama, MySQL) are stubbed — we only test the
deterministic logic: the SOAR queue insert builder, the cache-key
construction, and the fault tolerance around bad LLM output.
"""
from __future__ import annotations

from ai import utils


def test_analyze_with_ai_returns_error_string_when_endpoint_unreachable(monkeypatch):
    """The worker must never raise inside the LLM call — any RPC failure
    becomes a graceful `Error: ...` string so save_ai_results can persist a
    diagnostic row instead of dropping the entire log batch."""

    def boom(*_a, **_kw):
        raise ConnectionError("boom")

    monkeypatch.setattr(utils.requests, "post", boom)

    out = utils.analyze_with_ai(
        api_key="x",
        text="some log line",
        prompt_template="logs: {log_text}",
        endpoint="http://127.0.0.1:9",
        agent=None,
    )
    assert isinstance(out, str)
    assert out.startswith("Error connecting to AI service:")


def test_analyze_with_ai_returns_error_on_non_200(monkeypatch):
    class FakeResp:
        status_code = 500

        def json(self):
            return {}

    monkeypatch.setattr(utils.requests, "post", lambda *a, **k: FakeResp())

    out = utils.analyze_with_ai(
        api_key="x",
        text="log",
        prompt_template="x: {log_text}",
        endpoint="http://127.0.0.1:9",
        agent=None,
    )
    assert out == "Error: AI service returned 500"


def test_analyze_with_ai_strips_and_returns_response_field(monkeypatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"response": "   verdict here   "}

    monkeypatch.setattr(utils.requests, "post", lambda *a, **k: FakeResp())

    out = utils.analyze_with_ai(
        api_key="x",
        text="log",
        prompt_template="t: {log_text}",
        endpoint="http://127.0.0.1:9",
        agent=None,
    )
    assert out == "verdict here"


def test_queue_soar_action_rejects_empty_inputs():
    assert utils.queue_soar_action("agent1", "", "1.2.3.4") is False
    assert utils.queue_soar_action("agent1", "block_ip", "") is False


def test_is_critical_log_strips_no_critical_marker(monkeypatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"response": "Summary: No critical logs."}

    monkeypatch.setattr(utils.requests, "post", lambda *a, **k: FakeResp())

    out = utils.is_critical_log(
        api_key="x",
        log_text="benign event",
        endpoint="http://127.0.0.1:9",
    )
    assert out == "No critical logs."


def test_is_critical_log_returns_summary_when_flagged(monkeypatch):
    class FakeResp:
        status_code = 200

        def json(self):
            return {"response": "Summary: Lateral movement attempt on port 445"}

    monkeypatch.setattr(utils.requests, "post", lambda *a, **k: FakeResp())

    out = utils.is_critical_log(
        api_key="x",
        log_text="anything",
        endpoint="http://127.0.0.1:9",
    )
    assert "Lateral movement" in out
    assert "Summary:" not in out
