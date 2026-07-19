from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# For Postgres we keep a modest pool; SQLite (tests/dev) ignores pool args.
engine_kwargs: dict = {"echo": False, "future": True}
if settings.database_url.startswith("postgresql"):
    engine_kwargs.update(pool_size=5, max_overflow=5, pool_pre_ping=True)

engine = create_async_engine(settings.database_url, **engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
