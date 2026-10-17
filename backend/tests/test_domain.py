"""Indirizzo ufficiale: NOME.fly.dev e www. portano al dominio, il resto non cambia."""
import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture
def canonical(monkeypatch):
    monkeypatch.setattr(main, "CANONICAL_HOST", "openpulse.it")
    return TestClient(main.app, follow_redirects=False)


def test_fly_dev_and_www_go_to_the_domain(canonical):
    for host in ("people-pulse.fly.dev", "www.openpulse.it"):
        r = canonical.get("/q/12?x=1", headers={"host": host})
        assert r.status_code == 301
        assert r.headers["location"] == "https://openpulse.it/q/12?x=1"
    r = canonical.post("/api/auth/login", json={}, headers={"host": "people-pulse.fly.dev"})
    assert r.status_code == 308


def test_domain_health_and_internal_hosts_are_untouched(canonical):
    assert canonical.get("/api/health", headers={"host": "openpulse.it"}).status_code == 200
    assert canonical.get("/api/health", headers={"host": "people-pulse.fly.dev"}).status_code == 200
    assert canonical.get("/api/health", headers={"host": "172.19.0.2:8080"}).status_code == 200
    assert canonical.get("/api/me", headers={"host": "openpulse.it"}).status_code != 301


def test_no_canonical_host_means_no_redirect():
    assert main.CANONICAL_HOST == ""
    c = TestClient(main.app, follow_redirects=False)
    assert c.get("/api/health", headers={"host": "people-pulse.fly.dev"}).status_code == 200
