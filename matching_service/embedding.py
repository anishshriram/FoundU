# Implemented in Milestone 4 — Matching Microservice
#
# Responsibilities:
# - Serialize all completed profile fields into weighted text strings
#   using the field weight table (Section 11 of spec — weights sum to 100)
# - Personality type: Range-Based Reward encoding
#   (full weight within 1 point, partial within 2, zero beyond 3)
# - Optional Spotify enrichment: genre, energy, valence, tempo, artist
#   Graceful fallback if Spotify unavailable
# - Produce embedding vector via sentence-transformers
# - Write embedding_vector and embedding_updated_at to users table
#
# Field weight tiers (Section 11):
#   Tier 1 (55 pts): interests/hobbies(18), social_scene(13),
#                    social_frequency(12), personality_type(12)
#   Tier 2 (30 pts): drinking(6), ambition(5), smoking(5), year_in_school(4),
#                    communication_style(4), love_language(3), exercise(3)
#   Tier 3 (15 pts): music/Spotify(5), religion(1.5), ethnicity(1.5),
#                    political_leaning(1.5), sleep_schedule(1), living_situation(1),
#                    campus_involvement(1), height(1), dietary_preferences(1),
#                    star_sign(0.5)
