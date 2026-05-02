// Implemented in Milestone 8 — Notification Service
//
// Responsibilities:
// - Fire-and-forget APNs push dispatch — no DB writes, failures logged only
// - Push types: match_card_appear, mutual_signal, warm_intro_tap_received,
//   warm_intro_completed, warm_intro_expiring, report_received_confirmation
//
// A failing APNs call must never propagate an error to the triggering request.

export {}
