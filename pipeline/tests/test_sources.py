"""Resilience of source fetching: retries/backoff and zero-fixture alerts."""
import pandas as pd
import pytest
import requests

from footballseer import sources


class _Resp:
    def __init__(self, status, content=b"x"):
        self.status_code, self.content = status, content


@pytest.fixture
def calls(monkeypatch):
    sleeps = []
    monkeypatch.setattr(sources.time, "sleep", sleeps.append)
    return sleeps


def _seq(monkeypatch, items):
    it = iter(items)

    def fake(*a, **k):
        x = next(it)
        if isinstance(x, Exception):
            raise x
        return x
    monkeypatch.setattr(sources.requests, "get", fake)


def test_get_retries_transient_then_succeeds(monkeypatch, calls):
    _seq(monkeypatch, [requests.ConnectionError("boom"), _Resp(503), _Resp(200, b"ok")])
    assert sources._get("u") == b"ok"
    assert calls == [sources.BACKOFF, sources.BACKOFF * 2]


def test_get_gives_up_after_retries(monkeypatch, calls):
    _seq(monkeypatch, [_Resp(429)] * 3)
    assert sources._get("u", retries=3) is None
    assert len(calls) == 2


def test_get_does_not_retry_404_or_403(monkeypatch, calls):
    _seq(monkeypatch, [_Resp(404)])
    with pytest.raises(sources.NotFound):
        sources._get("u")
    _seq(monkeypatch, [_Resp(403)])
    assert sources._get("u") is None
    assert calls == []


def test_fixture_alerts_flags_leagues_with_no_fixtures():
    fx = pd.DataFrame({"league": ["E0", "E0", "SP1"], "home": list("abc"), "away": list("def")})
    alerts = sources.fixture_alerts(fx, ["E0", "SP1", "D1"])
    assert [a["league"] for a in alerts] == ["D1"]
    assert alerts[0]["kind"] == "no_fixtures" and alerts[0]["level"] == "warning"
    assert len(sources.fixture_alerts(fx.iloc[:0], ["E0", "D1"])) == 2
