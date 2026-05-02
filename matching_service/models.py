from pydantic import BaseModel


class ReindexRequest(BaseModel):
    user_id: int


class ReindexResponse(BaseModel):
    user_id: int
    success: bool
    duration_ms: float


class MatchCandidate(BaseModel):
    user_id: int
    score: float


class MatchPoolResponse(BaseModel):
    user_id: int
    candidates: list[MatchCandidate]
