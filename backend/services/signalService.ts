// Implemented in Milestone 6 — Signal Service
//
// Responsibilities:
// - sendSignal: validate receiver in match pool, create Signal (pending),
//   detect mutual Signal, transition to mutual, unlock Ice Breaker, create Warm Intro
// - getSignal: return Signal status and Ice Breaker content if mutual
// - getIntro: return Warm Intro status (without revealing one-sided tap)
// - tapIntro: record tap, exchange contact simultaneously on mutual tap,
//   delete contact values from Intro record immediately after delivery

export {}
