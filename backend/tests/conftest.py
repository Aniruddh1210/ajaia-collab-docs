import os
import uuid

# Configure the app for testing BEFORE importing any app module.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db import Base, engine
from app.main import app

JWT_SECRET = "test-secret"


def make_token(user_id: str, email: str, name: str | None = None) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "aud": "authenticated",
            "user_metadata": {"full_name": name or email.split("@")[0]},
        },
        JWT_SECRET,
        algorithm="HS256",
    )


class User:
    def __init__(self, email: str):
        self.id = str(uuid.uuid4())
        self.email = email
        self.token = make_token(self.id, email)
        self.headers = {"Authorization": f"Bearer {self.token}"}


@pytest_asyncio.fixture(autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def alice() -> User:
    return User("alice@example.com")


@pytest.fixture
def bob() -> User:
    return User("bob@example.com")


@pytest.fixture
def carol() -> User:
    return User("carol@example.com")
