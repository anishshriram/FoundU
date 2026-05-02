"""
Profile → embedding pipeline.

Field weight tiers (Section 11, weights sum to 100):
  Tier 1 (55): interests/hobbies(18), social_scene(13),
               social_frequency(12), personality_type(12)
  Tier 2 (30): drinking(6), ambition(5), smoking(5), year_in_school(4),
               communication_style(4), love_language(3), exercise(3)
  Tier 3 (15): music/Spotify(5), religion(1.5), ethnicity(1.5),
               political_leaning(1.5), sleep_schedule(1), living_situation(1),
               campus_involvement(1), height(1), dietary_preferences(1),
               star_sign(0.5)

Weight is expressed as repetition count (higher weight → more repetitions).
Scale factor: weight / 0.5 so the lowest weight (0.5) = 1 repetition.
"""

import asyncio
import logging
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from db import get_connection, fetch_user, write_embedding
from spotify import enrich_music

logger = logging.getLogger(__name__)

# Loaded once at module import; warm-up happens on first process start.
# TODO: TBD — confirm model before launch (placeholder: all-MiniLM-L6-v2, dim=384)
_model = SentenceTransformer("all-MiniLM-L6-v2")

# weight → repetitions (weight / 0.5, floored at 1)
_WEIGHT_REPS: dict[str, int] = {
    "interests":          36,  # 18 / 0.5
    "social_scene":       26,  # 13
    "social_frequency":   24,  # 12
    "personality_type":   24,  # 12
    "drinking":           12,  # 6
    "ambition":           10,  # 5
    "smoking":            10,  # 5
    "year_in_school":      8,  # 4
    "communication_style": 8,  # 4
    "love_language":       6,  # 3
    "exercise":            6,  # 3
    "music":              10,  # 5
    "religion":            3,  # 1.5
    "ethnicity":           3,  # 1.5
    "political_leaning":   3,  # 1.5
    "sleep_schedule":      2,  # 1
    "living_situation":    2,  # 1
    "campus_involvement":  2,  # 1
    "height":              2,  # 1
    "dietary_preferences": 2,  # 1
    "star_sign":           1,  # 0.5
}


def _repeat(text: str, times: int) -> list[str]:
    return [text] * times


def _build_profile_text(profile: dict, music_enrichment: Optional[dict]) -> str:
    prefs: dict = profile.get("preferences") or {}
    parts: list[str] = []

    def add(key: str, value: Optional[str]) -> None:
        if value:
            reps = _WEIGHT_REPS.get(key, 1)
            parts.extend(_repeat(value, reps))

    add("interests", prefs.get("interests"))
    add("social_scene", prefs.get("social_scene"))
    add("social_frequency", prefs.get("social_frequency"))
    add("personality_type", prefs.get("personality_type"))
    add("drinking", prefs.get("drinking"))
    add("ambition", prefs.get("ambition"))
    add("smoking", prefs.get("smoking"))
    add("year_in_school", prefs.get("year_in_school"))
    add("communication_style", prefs.get("communication_style"))
    add("love_language", prefs.get("love_language"))
    add("exercise", prefs.get("exercise"))

    # Music: combine declared preferences with Spotify enrichment
    music_text_parts: list[str] = []
    if prefs.get("music"):
        music_text_parts.append(str(prefs["music"]))
    if music_enrichment:
        if music_enrichment.get("genres"):
            music_text_parts.append(" ".join(music_enrichment["genres"][:10]))
        if music_enrichment.get("avg_energy") is not None:
            energy = music_enrichment["avg_energy"]
            valence = music_enrichment.get("avg_valence", 0.5)
            music_text_parts.append(
                f"{'high' if energy > 0.6 else 'low'} energy "
                f"{'positive' if valence > 0.6 else 'mellow'} music"
            )
    if music_text_parts:
        add("music", " ".join(music_text_parts))

    add("religion", prefs.get("religion"))
    add("ethnicity", prefs.get("ethnicity"))
    add("political_leaning", prefs.get("political_leaning"))
    add("sleep_schedule", prefs.get("sleep_schedule"))
    add("living_situation", prefs.get("living_situation"))
    add("campus_involvement", prefs.get("campus_involvement"))
    add("height", str(prefs["height"]) if prefs.get("height") else None)
    add("dietary_preferences", prefs.get("dietary_preferences"))
    add("star_sign", prefs.get("star_sign"))

    if not parts:
        # Fallback so the model always gets some input
        name = profile.get("name", "")
        parts = [f"Rutgers student {name}"]

    return " | ".join(parts)


async def generate_and_store_embedding(user_id: int) -> list[float]:
    conn = get_connection()
    try:
        profile = fetch_user(conn, user_id)
        if not profile:
            raise ValueError(f"User {user_id} not found")

        prefs: dict = profile.get("preferences") or {}
        artist_names: list[str] = prefs.get("music_artists") or []

        music_enrichment: Optional[dict] = None
        if artist_names:
            try:
                music_enrichment = await enrich_music(artist_names)
            except Exception as exc:
                logger.warning("Spotify enrichment failed for user %d: %s", user_id, exc)

        text = _build_profile_text(profile, music_enrichment)
        vector: np.ndarray = _model.encode(text, normalize_embeddings=True)
        vector_list = vector.tolist()

        write_embedding(conn, user_id, vector_list)
        logger.info("Embedding stored for user %d (dim=%d)", user_id, len(vector_list))
        return vector_list
    finally:
        conn.close()
