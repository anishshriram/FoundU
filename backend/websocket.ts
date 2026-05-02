// Implemented in Milestone 5 — Proximity Service and WebSocket
//
// Responsibilities:
// - Persistent WebSocket server alongside the Fastify HTTP server
// - JWT validation on every connection (reject unauthenticated)
// - In-memory map of user_id → WebSocket connection
// - Message types: match_card_appear, match_card_expire, mutual_signal, system_status
// - Graceful reconnection without requiring full reauthentication (grace period)

export {}
