# Implemented in Milestone 4 — Matching Microservice
#
# Responsibilities:
# - Spotify Client Credentials flow (server-to-server, no user auth required)
# - Fetch top artists/tracks for a user's declared music preferences
# - Extract: genre, energy, valence, tempo, artist attributes
# - Graceful fallback: if SPOTIFY_CLIENT_ID/SECRET missing or API unavailable,
#   log warning and return None — caller must handle absent music embedding
#
# Credentials stored in environment variables (never hardcoded):
#   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
