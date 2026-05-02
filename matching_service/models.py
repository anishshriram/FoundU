from pydantic import BaseModel

# Implemented in Milestone 4 — Matching Microservice
# Pydantic request/response models for the FastAPI service.


class ReindexRequest(BaseModel):
    user_id: int


class ReindexResponse(BaseModel):
    user_id: int
    success: bool
    duration_ms: float
