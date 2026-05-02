// Implemented in Milestone 7 — Safety Service
//
// Responsibilities:
// - submitReport: create Report + Block + BEvent, apply score_delta,
//   check suspension/ban thresholds, remove reported user from live view
// - blockUser: create Block + BEvent, apply score_delta
// - applyScoreDelta: update behavioral_score, check thresholds, update account_standing
// - passiveRecovery: background job — +2 per 24hrs for active accounts below 100
//   (TODO: TBD — confirm value before launch)
//
// Thresholds (all TODO: TBD — confirm value before launch):
//   suspension: -50  ban: -100
//   report_received: -15  block_received: -5
//   screenshot_detected: -20  passive_recovery: +2/24hrs

export {}
