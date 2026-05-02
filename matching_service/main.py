import asyncio
import logging
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool

load_dotenv()

from db import get_connection, fetch_match_pool
from embedding import generate_and_store_embedding
from models import MatchCandidate, MatchPoolResponse, ReindexRequest, ReindexResponse
from similarity import compute_match_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up the sentence-transformers model at startup so the first
    # /reindex call is not penalised by model load time.
    from embedding import _model
    _ = _model.encode("warmup", normalize_embeddings=True)
    logger.info("Sentence-transformers model warmed up")
    yield


app = FastAPI(title="FoundU Matching Service", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/reindex", response_model=ReindexResponse)
async def reindex(body: ReindexRequest) -> ReindexResponse:
    """
    Regenerate embedding for a single user and rebuild their match pool.
    Called by the Node backend after any profile update (fire-and-forget).
    Must complete within 60 seconds per NFR-1.5.
    """
    start = time.monotonic()
    try:
        await generate_and_store_embedding(body.user_id)
        await run_in_threadpool(compute_match_pool, body.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Reindex failed for user %d: %s", body.user_id, exc)
        raise HTTPException(status_code=500, detail="Reindex failed")

    duration_ms = (time.monotonic() - start) * 1000
    return ReindexResponse(user_id=body.user_id, success=True, duration_ms=duration_ms)


@app.get("/match-pool/{user_id}", response_model=MatchPoolResponse)
async def match_pool(user_id: int) -> MatchPoolResponse:
    """
    Return the pre-computed match pool for a user.
    Called by the proximity service (Milestone 5) when the user goes open.
    """
    def _fetch():
        conn = get_connection()
        try:
            return fetch_match_pool(conn, user_id)
        finally:
            conn.close()

    candidates = await run_in_threadpool(_fetch)
    if candidates is None:
        raise HTTPException(status_code=404, detail="No match pool found — run /reindex first")

    return MatchPoolResponse(
        user_id=user_id,
        candidates=[MatchCandidate(**c) for c in candidates],
    )
