import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import Base, engine
from app.routers import ai, documents, imports, shares

logger = logging.getLogger("ajaia")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Convenience for local SQLite dev: create tables automatically.
    # On Postgres/Supabase the schema is managed by migrations/001_init.sql,
    # so we don't auto-create there.
    if settings.database_url.startswith("sqlite"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="Ajaia Collaborative Docs API", version="1.0.0", lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(shares.router)
app.include_router(imports.router)
app.include_router(ai.router)


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )
