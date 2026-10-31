from fastapi.testclient import TestClient
from datetime import datetime, timezone
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.db import Base, get_db
from app.main import api, app
from app.models import Merchant


def test_tenant_scoped_workflows_and_approval_boundary(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    api.dependency_overrides[get_db] = override_db
    settings = get_settings()
    old_key = settings.session_signing_key
    old_env = settings.app_env
    old_elevenlabs_key = settings.elevenlabs_api_key
    settings.session_signing_key = "test-only-signing-key-with-more-than-32-bytes"
    settings.app_env = "testing"
    try:
        with TestClient(app) as client:
            merchant_a = client.post("/api/v1/merchants", json={"name": "Shop A", "tier": "qr"}).json()
            token_a = client.post("/api/v1/auth/local-session", params={"merchant_id": merchant_a["id"]}).json()["access_token"]
            headers_a = {"Authorization": f"Bearer {token_a}"}
            occurred = datetime.now(timezone.utc).isoformat()
            imported = client.post("/api/v1/integrations/import/transactions", headers=headers_a, json={"transactions":[
                {"external_id":"payment-1","amount":"125.50","status":"succeeded","occurred_at":occurred},
                {"external_id":"refund-1","amount":"10.00","status":"refunded","occurred_at":occurred},
                {"external_id":"payment-1","amount":"125.50","status":"succeeded","occurred_at":occurred},
            ]})
            assert imported.status_code == 200
            assert imported.json()["accepted"] == 2 and imported.json()["duplicates_skipped"] == 1
            assert imported.json()["provider_connected"] is False
            repeated = client.post("/api/v1/integrations/import/transactions", headers=headers_a, json={"transactions":[
                {"external_id":"payment-1","amount":"125.50","status":"succeeded","occurred_at":occurred},
                {"external_id":"refund-1","amount":"10.00","status":"refunded","occurred_at":occurred},
            ]})
            assert repeated.json()["accepted"] == 0 and repeated.json()["duplicates_skipped"] == 2
            conflict = client.post("/api/v1/integrations/import/transactions", headers=headers_a, json={"transactions":[
                {"external_id":"payment-1","amount":"999.00","status":"succeeded","occurred_at":occurred},
            ]})
            assert conflict.status_code == 409
            summary = client.get("/api/v1/dashboard/sales?days=1", headers=headers_a).json()
            assert summary["collection_total"] == "125.50"
            assert summary["refunds_total"] == "10.00"
            briefing = client.get("/api/v1/dashboard/briefing?language=hi", headers=headers_a)
            assert briefing.status_code == 200
            assert briefing.json()["language"] == "hi"
            assert briefing.json()["collections"] == "125.50"
            assert any("आज" in item["text"] for item in briefing.json()["insights"])
            timeline = client.get("/api/v1/analytics/timeline?period=day", headers=headers_a)
            assert timeline.status_code == 200
            assert len(timeline.json()["buckets"]) == 24
            assert timeline.json()["collections"] == "125.50"
            assert timeline.json()["refunds"] == "10.00"
            assert timeline.json()["collections_are_not_profit"] is True
            customer = client.post("/api/v1/customers", headers=headers_a,
                                   json={"display_name": "Customer A"}).json()
            assert customer["consent_marketing"] is False
            created_consent = client.patch(f"/api/v1/customers/{customer['id']}/marketing-consent",
                                           headers=headers_a, json={"consent": True})
            assert created_consent.status_code == 200
            conversation = client.post("/api/v1/conversations", headers=headers_a).json()
            answer = client.post("/api/v1/assistant/query", headers=headers_a,
                                 json={"question": "What were today's sales?", "conversation_id": conversation["id"],
                                       "response_language": "hi"})
            assert answer.status_code == 200
            assert answer.json()["grounded"] is True
            assert "आज" in answer.json()["answer"]
            assert len(client.get(f"/api/v1/conversations/{conversation['id']}/messages", headers=headers_a).json()) == 2

            settings.elevenlabs_api_key = "test-elevenlabs-key"
            monkeypatch.setattr("app.providers.get_elevenlabs_voices", lambda: (
                [{"voice_id": "test-voice", "name": "Test voice", "category": "voice",
                  "accent": "", "gender": ""}], "test-voice"))
            voices = client.get("/api/v1/assistant/voices", headers=headers_a)
            assert voices.status_code == 200
            assert voices.json()["default_voice_id"] == "test-voice"
            monkeypatch.setattr("app.providers.generate_elevenlabs_speech",
                                lambda text, voice_id=None: b"ID3-test-audio")
            speech = client.post("/api/v1/assistant/speech", headers=headers_a,
                                 json={"text": "Hello", "voice_id": "test-voice"})
            assert speech.status_code == 200
            assert speech.headers["content-type"] == "audio/mpeg"
            assert speech.content == b"ID3-test-audio"

            proposal = client.post("/api/v1/approvals", headers=headers_a,
                                   json={"kind": "purchase_order", "payload": {"reference": "PO-1"}}).json()
            decision = client.post(f"/api/v1/approvals/{proposal['id']}/decision?decision=approve", headers=headers_a).json()
            assert decision["executed"] is False
            assert decision["status"] == "approved_pending_provider"

            supplier = client.post("/api/v1/suppliers", headers=headers_a, json={"name": "Local supplier"}).json()
            product = client.post("/api/v1/inventory", headers=headers_a,
                                  json={"name": "Tea", "quantity": 2, "reorder_level": 5, "unit": "pack"}).json()
            adjustment = client.post(f"/api/v1/inventory/{product['id']}/movements", headers=headers_a,
                                     json={"delta": 4, "reason": "Stock count"})
            assert adjustment.status_code == 201
            assert adjustment.json()["resulting_quantity"] == 6
            insufficient = client.post(f"/api/v1/inventory/{product['id']}/movements", headers=headers_a,
                                        json={"delta": -7, "reason": "Incorrect count"})
            assert insufficient.status_code == 409
            order = client.post("/api/v1/purchase-orders", headers=headers_a, json={
                "supplier_id": supplier["id"],
                "lines": [{"product_id": product["id"], "quantity": 8, "unit_cost": "42.50"}],
            }).json()
            assert order["status"] == "draft"
            order_decision = client.post(
                f"/api/v1/approvals/{order['proposal_id']}/decision?decision=approve", headers=headers_a).json()
            assert order_decision["executed"] is False
            listed_orders = client.get("/api/v1/purchase-orders", headers=headers_a).json()
            assert listed_orders[0]["status"] == "approved_pending_provider"

            merchant_b = client.post("/api/v1/merchants", json={"name": "Shop B", "tier": "qr"}).json()
            token_b = client.post("/api/v1/auth/local-session", params={"merchant_id": merchant_b["id"]}).json()["access_token"]
            customers_b = client.get("/api/v1/customers", headers={"Authorization": f"Bearer {token_b}"})
            assert customers_b.status_code == 200
            assert customers_b.json() == []
            foreign = client.patch(f"/api/v1/customers/{customer['id']}/marketing-consent",
                                   headers={"Authorization": f"Bearer {token_b}"}, json={"consent": False})
            assert foreign.status_code == 404
            assert client.get("/api/v1/me").status_code == 401
            assert client.get("/api/v1/openapi.json").status_code == 200

            missing_confirmation = client.delete("/api/v1/account", headers=headers_a)
            assert missing_confirmation.status_code == 422
            deleted = client.request("DELETE", "/api/v1/account", headers=headers_a,
                                     json={"confirm": True})
            assert deleted.status_code == 200 and deleted.json() == {"deleted": True}
            assert client.get("/api/v1/me", headers=headers_a).status_code == 403
            with TestingSession() as db:
                assert db.get(Merchant, merchant_a["id"]) is None
                for table in Base.metadata.sorted_tables:
                    if table.name != "merchants" and "merchant_id" in table.c:
                        remaining = db.scalar(select(func.count()).select_from(table).where(
                            table.c.merchant_id == merchant_a["id"]))
                        assert remaining == 0, f"{table.name} still contains deleted merchant records"
                assert db.scalar(select(func.count()).select_from(Base.metadata.tables["messages"])) == 0
                assert db.get(Merchant, merchant_b["id"]) is not None
    finally:
        api.dependency_overrides.clear()
        settings.session_signing_key = old_key
        settings.app_env = old_env
        settings.elevenlabs_api_key = old_elevenlabs_key
        Base.metadata.drop_all(engine)
        engine.dispose()
