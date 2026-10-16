import os
import sys
import tempfile
from pathlib import Path

# Ambiente di test isolato: SQLite temporaneo, niente rate limit, soglia bassa.
os.environ["PULSE_DATA_DIR"] = tempfile.mkdtemp()
os.environ["PULSE_RATE_LIMIT"] = "off"
os.environ["PULSE_MIN_RESULTS"] = "2"
os.environ["PULSE_PROPOSAL_GOAL"] = "3"
os.environ["PULSE_MIN_CITY_RESULTS"] = "2"
os.environ["ADMIN_KEY"] = "test-admin-key"
# Di default i test usano SQLite temporaneo. Per provarli su PostgreSQL/Neon (DB vuoto e usa-e-getta!):
#   PULSE_TEST_DATABASE_URL=postgresql://... pytest
os.environ.pop("DATABASE_URL", None)
if os.getenv("PULSE_TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["PULSE_TEST_DATABASE_URL"]
os.environ.pop("SECRET_KEY", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _lifespan():
    with TestClient(app):  # crea lo schema una volta sola
        # nei test servono sondaggi già pronti: si usano le domande di esempio (in produzione non ci sono)
        from app.db import SessionLocal
        from app.seed_data import seed_questions

        with SessionLocal() as db:
            seed_questions(db)
        yield


@pytest.fixture
def new_client():
    def make() -> TestClient:
        return TestClient(app)

    return make


_counter = {"n": 0}


@pytest.fixture
def user(new_client):
    """Un utente registrato e già autenticato (cookie nel client)."""

    def make(city=None, password="una-password-lunga-1"):
        _counter["n"] += 1
        nick = f"tester{_counter['n']}"
        c = new_client()
        r = c.post("/api/auth/register",
                   json={"nickname": nick, "password": password, "city": city, "consent": True})
        assert r.status_code == 201, r.text
        return c, nick, password, r.json()["recovery_code"]

    return make
