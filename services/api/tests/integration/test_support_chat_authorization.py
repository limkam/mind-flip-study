"""Every admin support route rejects an ordinary user before handler execution."""
from datetime import UTC, datetime
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from dependencies import get_current_user
from main import app
from models.enums import UserRole
from models.user import User
from pydantic import ValidationError
from schemas.feedback import SupportMessageCreate


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,json", [
    ("GET", "/admin/feedback/conversations", None),
    ("GET", "/admin/feedback/conversations?q=casey", None),
    ("GET", "/admin/feedback/dashboard?range=7d", None),
    ("GET", f"/admin/feedback/conversations/{uuid.uuid4()}", None),
    ("POST", f"/admin/feedback/conversations/{uuid.uuid4()}/messages", {"message":"x", "client_message_id":str(uuid.uuid4())}),
    ("POST", f"/admin/feedback/conversations/{uuid.uuid4()}/resolve", None),
    ("POST", f"/admin/feedback/conversations/{uuid.uuid4()}/reopen", None),
])
async def test_student_is_forbidden_from_admin_support_endpoints(method, path, json):
    now = datetime.now(UTC)
    student = User(id=uuid.uuid4(), email="support-idor@example.test", role=UserRole.student, full_name="Attacker", preferences={}, subscription_tier="free", created_at=now, updated_at=now)
    async def override(): return student
    app.dependency_overrides[get_current_user] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.request(method, path, json=json)
        assert response.status_code == 403
        assert "Conversation" not in response.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_user_message_payload_cannot_choose_conversation_or_sender():
    with pytest.raises(ValidationError):
        SupportMessageCreate(message="inject", client_message_id=uuid.uuid4(), conversation_id=uuid.uuid4(), sender_type="admin")


def test_unknown_support_category_is_rejected():
    with pytest.raises(ValidationError):
        SupportMessageCreate(message="invalid", client_message_id=uuid.uuid4(), category="secret_admin_category")
