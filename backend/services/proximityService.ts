// Implemented in Milestone 5 — Proximity Service and WebSocket
//
// Responsibilities:
// - toggleOpen: read GPS (ephemeral), query match pool, push match_card_appear via WS,
//   freeze pool, set is_open = true
// - toggleOff: set is_open = false, send match_card_expire to affected users
// - getMatches: return active match cards (name, age, photo_url — no coordinates)
// - autoRefresh: trigger on high-density threshold (TODO: TBD — confirm value before launch)

export {}
