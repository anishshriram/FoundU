import { PrismaClient, BEventType, ReportReason } from '@prisma/client'
import { goOff } from './proximityService'

const prisma = new PrismaClient()

// TODO: TBD — confirm all threshold values before launch (FR-8.5)
const SCORE_DELTAS: Record<BEventType, number> = {
  report_received:             -15,
  block_received:               -5,
  screenshot_detected:         -20,
  multiple_accounts_detected:  -50,
  passive_recovery:             +2,
}
const SUSPENSION_THRESHOLD = -50
const BAN_THRESHOLD        = -100
const PASSIVE_RECOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000  // 24 hours

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number }
  err.statusCode = statusCode
  return err
}

async function applyScoreDelta(
  userId: number,
  eventType: BEventType,
  triggeredById: number | null,
  reportId: number | null,
  blockId: number | null,
): Promise<void> {
  const delta = SCORE_DELTAS[eventType]

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { behavioral_score: true, account_standing: true },
  })
  if (!user) return

  const newScore = user.behavioral_score + delta
  const newStanding =
    newScore <= BAN_THRESHOLD        ? 'banned'    :
    newScore <= SUSPENSION_THRESHOLD ? 'suspended' :
    user.account_standing === 'banned' || user.account_standing === 'suspended'
      ? user.account_standing  // don't auto-restore via positive delta
      : 'active'

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { behavioral_score: newScore, account_standing: newStanding },
    }),
    prisma.bEvent.create({
      data: {
        user_id: userId,
        event_type: eventType,
        score_delta: delta,
        triggered_by_id: triggeredById,
        report_id: reportId,
        block_id: blockId,
      },
    }),
  ])

  // If the user just got suspended or banned, force them off and expire cards
  if (
    (newStanding === 'suspended' || newStanding === 'banned') &&
    user.account_standing === 'active'
  ) {
    await goOff(userId).catch(() => {
      // User may not be open — ignore
    })
  }
}

async function ensureNoSelfAction(actorId: number, targetId: number): Promise<void> {
  if (actorId === targetId) throw makeError('Cannot perform this action on yourself', 400)
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface SubmitReportInput {
  reported_id: number
  signal_id?: number | null
  warm_intro_id?: number | null
  reason: ReportReason
  reason_detail?: string | null
}

export async function submitReport(
  reporterId: number,
  input: SubmitReportInput,
): Promise<{ report_id: number; block_id: number }> {
  await ensureNoSelfAction(reporterId, input.reported_id)

  // Check reported user exists and is not already blocked
  const reported = await prisma.user.findUnique({
    where: { id: input.reported_id },
    select: { id: true },
  })
  if (!reported) throw makeError('User not found', 404)

  const existingBlock = await prisma.block.findUnique({
    where: { blocker_id_blocked_id: { blocker_id: reporterId, blocked_id: input.reported_id } },
    select: { id: true },
  })

  const [report, block] = await prisma.$transaction(async (tx) => {
    const r = await tx.report.create({
      data: {
        reporter_id: reporterId,
        reported_id: input.reported_id,
        signal_id: input.signal_id ?? null,
        warm_intro_id: input.warm_intro_id ?? null,
        reason: input.reason,
        reason_detail: input.reason_detail ?? null,
      },
      select: { id: true },
    })

    // Auto-block on report (idempotent — skip if already blocked)
    const b = existingBlock
      ? existingBlock
      : await tx.block.create({
          data: { blocker_id: reporterId, blocked_id: input.reported_id },
          select: { id: true },
        })

    return [r, b]
  })

  // Apply score delta to reported user
  await applyScoreDelta(input.reported_id, 'report_received', reporterId, report.id, null)

  // Remove reported user from reporter's live match cards
  await goOff(input.reported_id).catch(() => {})

  return { report_id: report.id, block_id: block.id }
}

export async function getReports(reporterId: number) {
  return prisma.report.findMany({
    where: { reporter_id: reporterId },
    select: {
      id: true,
      reported_id: true,
      reason: true,
      reason_detail: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' },
  })
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export async function blockUser(
  blockerId: number,
  blockedId: number,
): Promise<{ block_id: number }> {
  await ensureNoSelfAction(blockerId, blockedId)

  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } })
  if (!target) throw makeError('User not found', 404)

  // UNIQUE constraint prevents duplicates — catch and surface cleanly
  let block: { id: number }
  try {
    block = await prisma.block.create({
      data: { blocker_id: blockerId, blocked_id: blockedId },
      select: { id: true },
    })
  } catch {
    throw makeError('Already blocked', 409)
  }

  await applyScoreDelta(blockedId, 'block_received', blockerId, null, block.id)
  await goOff(blockedId).catch(() => {})

  return { block_id: block.id }
}

export async function getBlocks(blockerId: number) {
  return prisma.block.findMany({
    where: { blocker_id: blockerId },
    select: { id: true, blocked_id: true, created_at: true },
    orderBy: { created_at: 'desc' },
  })
}

// ---------------------------------------------------------------------------
// Screenshot detection (triggered by iOS client)
// ---------------------------------------------------------------------------

export async function recordScreenshot(
  reporterId: number,
  reportedId: number,
): Promise<void> {
  await ensureNoSelfAction(reporterId, reportedId)
  await applyScoreDelta(reportedId, 'screenshot_detected', reporterId, null, null)
}

// ---------------------------------------------------------------------------
// Passive score recovery — runs on server startup, repeats every 24 hrs
// ---------------------------------------------------------------------------

export function startPassiveRecovery(): void {
  const run = async () => {
    try {
      // +2 to every active user whose score is below 100
      const result = await prisma.user.updateMany({
        where: { account_standing: 'active', behavioral_score: { lt: 100 } },
        data: { behavioral_score: { increment: SCORE_DELTAS.passive_recovery } },
      })
      if (result.count > 0) {
        // Record BEvents in bulk — best-effort, not transactional
        const users = await prisma.user.findMany({
          where: { account_standing: 'active', behavioral_score: { lte: 100 } },
          select: { id: true },
        })
        await prisma.bEvent.createMany({
          data: users.map((u) => ({
            user_id: u.id,
            event_type: 'passive_recovery' as BEventType,
            score_delta: SCORE_DELTAS.passive_recovery,
          })),
          skipDuplicates: true,
        })
      }
    } catch (err) {
      console.error('[safetyService] passive recovery error:', (err as Error).message)
    }
    setTimeout(run, PASSIVE_RECOVERY_INTERVAL_MS)
  }

  // First run after one interval so it doesn't fire on every dev server restart
  setTimeout(run, PASSIVE_RECOVERY_INTERVAL_MS)
}
