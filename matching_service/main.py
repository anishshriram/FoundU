from fastapi import FastAPI

# Matching microservice — internal only.
# Never expose a public endpoint; called only by the Node.js backend.
# Full implementation in Milestone 4.

app = FastAPI(title="FoundU Matching Service", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# POST /reindex — implemented in Milestone 4
# Accepts { user_id }, triggers embedding generation and match pool rebuild.
# Must complete within 60 seconds (NFR-1.5).
