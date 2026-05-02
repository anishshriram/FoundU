import base64
import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# NOTE: Spotify ToS prohibits using their content to train ML/AI models.
# Spotify enrichment is used here for profile matching similarity only.
# Confirm compliance with Spotify ToS before launch.

_token_cache: Optional[str] = None
_token_expiry: float = 0.0  # Unix timestamp; 0 means expired/unset


async def _get_token(client: httpx.AsyncClient) -> Optional[str]:
    global _token_cache, _token_expiry
    # Refresh 60 seconds before actual expiry to avoid edge-case 401s
    if _token_cache and time.time() < _token_expiry - 60:
        return _token_cache

    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None

    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        resp = await client.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {creds}"},
            data={"grant_type": "client_credentials"},
            timeout=10.0,
        )
        resp.raise_for_status()
        payload = resp.json()
        _token_cache = payload["access_token"]
        _token_expiry = time.time() + payload.get("expires_in", 3600)
        return _token_cache
    except Exception as exc:
        logger.warning("Spotify token fetch failed: %s", exc)
        _token_cache = None
        _token_expiry = 0.0
        return None


async def enrich_music(artist_names: list[str]) -> Optional[dict]:
    """
    Given a list of artist names declared in the user's profile, returns
    aggregated genre/audio-feature metadata for use in the embedding.

    Returns None (graceful fallback) if:
    - SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are absent
    - Spotify API is unavailable
    - artist_names is empty
    """
    if not artist_names:
        return None

    async with httpx.AsyncClient() as client:
        token = await _get_token(client)
        if not token:
            return None

        headers = {"Authorization": f"Bearer {token}"}
        genres: list[str] = []
        top_track_ids: list[str] = []

        for artist_name in artist_names[:5]:  # cap at 5 to avoid rate limits
            try:
                search_resp = await client.get(
                    "https://api.spotify.com/v1/search",
                    headers=headers,
                    params={"q": artist_name, "type": "artist", "limit": 1},
                    timeout=10.0,
                )
                search_resp.raise_for_status()
                items = search_resp.json().get("artists", {}).get("items", [])
                if not items:
                    continue
                artist = items[0]
                genres.extend(artist.get("genres", []))

                # Fetch top track for audio features
                tracks_resp = await client.get(
                    f"https://api.spotify.com/v1/artists/{artist['id']}/top-tracks",
                    headers=headers,
                    params={"market": "US"},
                    timeout=10.0,
                )
                tracks_resp.raise_for_status()
                tracks = tracks_resp.json().get("tracks", [])
                if tracks:
                    top_track_ids.append(tracks[0]["id"])
            except Exception as exc:
                logger.warning("Spotify artist lookup failed for %r: %s", artist_name, exc)

        if not top_track_ids:
            return {"genres": list(set(genres))} if genres else None

        # Fetch audio features for collected track IDs
        energy_vals: list[float] = []
        valence_vals: list[float] = []
        tempo_vals: list[float] = []

        try:
            features_resp = await client.get(
                "https://api.spotify.com/v1/audio-features",
                headers=headers,
                params={"ids": ",".join(top_track_ids[:5])},
                timeout=10.0,
            )
            features_resp.raise_for_status()
            for feat in features_resp.json().get("audio_features") or []:
                if feat:
                    energy_vals.append(feat["energy"])
                    valence_vals.append(feat["valence"])
                    tempo_vals.append(feat["tempo"])
        except Exception as exc:
            logger.warning("Spotify audio features fetch failed: %s", exc)

        result: dict = {"genres": list(set(genres))}
        if energy_vals:
            result["avg_energy"] = sum(energy_vals) / len(energy_vals)
            result["avg_valence"] = sum(valence_vals) / len(valence_vals)
            result["avg_tempo"] = sum(tempo_vals) / len(tempo_vals)

        return result if result.get("genres") or result.get("avg_energy") else None
