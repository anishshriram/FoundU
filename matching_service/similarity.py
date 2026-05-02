# Implemented in Milestone 4 — Matching Microservice
#
# Responsibilities:
# - Load all active (non-suspended, non-banned) user embeddings from DB
# - Apply hard filters BEFORE any vector math:
#     1. mutual gender_preference match
#     2. mutual age_range inclusion (A in B's range AND B in A's range)
# - Compute cosine similarity using faiss
# - Include users at or above match threshold in match pool
#   TODO: TBD — confirm value before launch (placeholder: 0.65)
# - Store match pool result for use by proximity service
# - Full rebuild triggered on every profile update
# - Must complete within 60 seconds for a pool of 1000 users (NFR-1.5)
