"""
Match pool computation.

Hard filters applied before any vector math:
  1. Mutual gender_preference match
  2. Mutual age_range inclusion (A in B's range AND B in A's range)

Cosine similarity via FAISS (inner product on L2-normalised vectors).

TODO: TBD — confirm similarity threshold before launch (placeholder: 0.65)
"""

import logging
from typing import Optional

import faiss
import numpy as np

from db import get_connection, fetch_all_active_users_with_embeddings, upsert_match_pool

logger = logging.getLogger(__name__)

# TODO: TBD — confirm value before launch (placeholder: 0.65)
MATCH_THRESHOLD: float = 0.65


def _passes_hard_filters(a: dict, b: dict) -> bool:
    """Return True iff A and B mutually match on gender and age."""
    # Gender preference mutual match
    a_pref = (a.get("gender_preference") or "").lower()
    b_pref = (b.get("gender_preference") or "").lower()
    a_identity = (a.get("gender_identity") or "").lower()
    b_identity = (b.get("gender_identity") or "").lower()

    def prefers(pref: str, identity: str) -> bool:
        return pref in ("everyone", "all", "") or pref == identity

    if not (prefers(a_pref, b_identity) and prefers(b_pref, a_identity)):
        return False

    # Age range mutual inclusion
    a_age = a.get("age")
    b_age = b.get("age")
    a_min = a.get("age_range_min")
    a_max = a.get("age_range_max")
    b_min = b.get("age_range_min")
    b_max = b.get("age_range_max")

    if None in (a_age, b_age, a_min, a_max, b_min, b_max):
        return True  # skip filter if profile incomplete

    if not (b_min <= a_age <= b_max):
        return False
    if not (a_min <= b_age <= a_max):
        return False

    return True


def compute_match_pool(user_id: int) -> list[dict]:
    """
    Rebuild the match pool for user_id and persist it to match_pools table.
    Returns list of { user_id, score } sorted by score descending.
    """
    conn = get_connection()
    try:
        rows = fetch_all_active_users_with_embeddings(conn)
        if not rows:
            upsert_match_pool(conn, user_id, [])
            return []

        target: Optional[dict] = None
        others: list[dict] = []
        for row in rows:
            if row["id"] == user_id:
                target = row
            else:
                others.append(row)

        if target is None or target.get("embedding_vector") is None:
            logger.warning("User %d has no embedding — match pool empty", user_id)
            upsert_match_pool(conn, user_id, [])
            return []

        # Apply hard filters
        candidates = [u for u in others if _passes_hard_filters(target, u)]
        if not candidates:
            upsert_match_pool(conn, user_id, [])
            return []

        # Build matrix of candidate embeddings
        vecs = np.array(
            [np.array(c["embedding_vector"], dtype=np.float32) for c in candidates],
            dtype=np.float32,
        )
        dim = vecs.shape[1]

        # L2-normalize so inner product = cosine similarity
        faiss.normalize_L2(vecs)

        index = faiss.IndexFlatIP(dim)
        index.add(vecs)

        query = np.array(
            [np.array(target["embedding_vector"], dtype=np.float32)], dtype=np.float32
        )
        faiss.normalize_L2(query)

        k = min(len(candidates), 500)
        scores, indices = index.search(query, k)

        pool: list[dict] = []
        for score, idx in zip(scores[0], indices[0]):
            if score < MATCH_THRESHOLD:
                break
            pool.append({"user_id": candidates[idx]["id"], "score": float(score)})

        upsert_match_pool(conn, user_id, pool)
        logger.info(
            "Match pool for user %d: %d candidates (threshold=%.2f)",
            user_id, len(pool), MATCH_THRESHOLD,
        )
        return pool
    finally:
        conn.close()
