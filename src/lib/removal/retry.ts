/**
 * Retry Policy for No-Response Email Brokers (Phase 2, Chunk 5)
 *
 * Handles automatic follow-up for email-method RemovalRequests that
 * never receive a meaningful broker response within defined windows.
 *
 * Retry schedule:
 *   Stage 0 → 1: First follow-up after 7 days without meaningful response
 *   Stage 1 → 2: Second follow-up after 14 more days (21 days total)
 *   Stage 2 → 3: Escalated — marked for manual review after 14 more days (35 days total)
 *
 * "Meaningful response" means a matched inbound message classified as
 * acknowledgment, completion, rejection, or needs_more_info.
 * Noise-classified replies do NOT suppress retries.
 *
 * Guardrails:
 *   - Only retries email-method requests in "submitted" status
 *   - Never retries acknowledged, completed, rejected, or requires_user_action
 *   - Skips requests with a pending user task (chunk 4 controls those)
 *   - Respects nextRetryAt — never sends too frequently
 */

import { prisma } from "@/lib/db";
import { buildFollowUpEmail } from "@/lib/removal/email-template";
import {
  deliverBrokerEmail,
  logBrokerEmailFailure,
} from "@/lib/removal/email-delivery";
import { decodeRemovalProfileSnapshot } from "@/lib/removal/profile";

// ─── Retry Schedule ─────────────────────────────────────────

export interface RetryStageConfig {
  /** Stage number (1-based for follow-ups; stage 0 is the initial send) */
  stage: number;
  /** Days after the previous attempt before this follow-up fires */
  delayDays: number;
  /** What happens at this stage: "follow_up" sends an email, "escalate" marks for review */
  action: "follow_up" | "escalate";
}

/**
 * Declarative retry schedule. Easy to inspect and change.
 * Stage 0 is the initial send (already handled by processRemoval).
 */
export const RETRY_SCHEDULE: RetryStageConfig[] = [
  { stage: 1, delayDays: 7, action: "follow_up" },
  { stage: 2, delayDays: 14, action: "follow_up" },
  { stage: 3, delayDays: 14, action: "escalate" },
];

/** Classifications that count as a "meaningful" broker response */
const MEANINGFUL_CLASSIFICATIONS = [
  "acknowledgment",
  "completion",
  "rejection",
  "needs_more_info",
];

// ─── Result Types ───────────────────────────────────────────

export interface RetryResult {
  eligible: number;
  retried: number;
  escalated: number;
  skipped: number;
  errors: number;
}

interface EligibleRequest {
  id: string;
  retryStage: number;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  brokerId: string;
  deletionRequestId: string;
  broker: { name: string; removalEndpoint: string | null };
  deletionRequest: { payloadSnapshot: string };
}

interface RetryAttemptRecordInput {
  removalRequestId: string;
  stage: number;
  action: "follow_up" | "escalate";
  outcome: "sent" | "failed" | "escalated";
  reason: string;
  attemptedAt: Date;
  nextRetryAt?: Date | null;
  providerMessageId?: string | null;
  outboundMessageId?: string | null;
  error?: string | null;
}

// ─── Core: Find Eligible Requests ───────────────────────────

/**
 * Find email RemovalRequests eligible for retry.
 *
 * Eligible means:
 *   1. method === "email" and status === "submitted"
 *   2. retryStage < max stage in RETRY_SCHEDULE
 *   3. nextRetryAt <= now (or nextRetryAt is null and enough time has passed)
 *   4. No meaningful inbound response exists
 *   5. No pending user task blocks the request
 */
export async function findRetryEligible(now: Date): Promise<EligibleRequest[]> {
  const maxStage = Math.max(...RETRY_SCHEDULE.map((s) => s.stage));

  // Find candidates: email-method, submitted, not yet fully escalated
  const candidates = await prisma.removalRequest.findMany({
    where: {
      method: "email",
      status: "submitted",
      retryStage: { lt: maxStage },
    },
    include: {
      broker: { select: { name: true, removalEndpoint: true } },
      deletionRequest: { select: { payloadSnapshot: true } },
    },
  });

  const eligible: EligibleRequest[] = [];

  for (const req of candidates) {
    // Check timing: is it time for the next retry?
    if (!isRetryDue(req, now)) continue;

    // Check for meaningful inbound response
    if (await hasMeaningfulResponse(req.id)) continue;

    // Check for pending user task that should block retries
    if (await hasPendingUserTask(req.id)) continue;

    eligible.push(req);
  }

  return eligible;
}

// ─── Core: Execute Retries ──────────────────────────────────

/**
 * Process all eligible retry candidates.
 * Called from the maintenance cycle (cron).
 */
export async function processRetries(): Promise<RetryResult> {
  const now = new Date();
  const eligible = await findRetryEligible(now);

  const result: RetryResult = {
    eligible: eligible.length,
    retried: 0,
    escalated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const req of eligible) {
    const nextStage = req.retryStage + 1;
    const config = RETRY_SCHEDULE.find((s) => s.stage === nextStage);

    if (!config) {
      result.skipped++;
      continue;
    }

    try {
      if (config.action === "escalate") {
        await escalateRequest(req, now);
        result.escalated++;
      } else {
        await retryRequest(req, config, now);
        result.retried++;
      }
    } catch (error) {
      console.error("[nuke][retry] failed", {
        requestId: req.id,
        stage: nextStage,
        error: error instanceof Error ? error.message : "unknown",
      });
      result.errors++;
    }
  }

  return result;
}

// ─── Retry Execution ────────────────────────────────────────

async function retryRequest(
  req: EligibleRequest,
  config: RetryStageConfig,
  now: Date
): Promise<void> {
  const profile = decodeRemovalProfileSnapshot(
    req.deletionRequest.payloadSnapshot
  );
  const displayName = profile.fullNames[0] || "Consumer";
  const followUp = buildFollowUpEmail(
    profile,
    req.broker.name,
    config.stage
  );

  const to = req.broker.removalEndpoint;
  if (!to) {
    throw new Error(`No email endpoint for broker ${req.broker.name}`);
  }

  const outboundMessage = {
    brokerName: req.broker.name,
    requestId: req.id,
    to,
    subject: followUp.subject,
    text: followUp.text,
    replyTo: followUp.replyTo,
  };

  try {
    const deliveryResult = await deliverBrokerEmail(outboundMessage);

    // Compute when the next retry would be eligible
    const nextConfig = RETRY_SCHEDULE.find(
      (s) => s.stage === config.stage + 1
    );
    const nextRetryAt = nextConfig
      ? new Date(now.getTime() + nextConfig.delayDays * 24 * 60 * 60 * 1000)
      : null;
    const reason = `follow_up_${config.stage}: no meaningful response after ${config.delayDays} days`;

    await prisma.$transaction([
      prisma.removalRequest.update({
        where: { id: req.id },
        data: {
          retryStage: config.stage,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          providerMessageId: deliveryResult.providerMessageId,
          outboundMessageId: deliveryResult.outboundMessageId ?? undefined,
          lastError: null,
          lastRetryReason: reason,
          nextRetryAt,
        },
      }),
      recordRetryAttempt({
        removalRequestId: req.id,
        stage: config.stage,
        action: "follow_up",
        outcome: "sent",
        reason,
        attemptedAt: now,
        nextRetryAt,
        providerMessageId: deliveryResult.providerMessageId,
        outboundMessageId: deliveryResult.outboundMessageId ?? null,
      }),
    ]);

    console.info("[nuke][retry]", {
      requestId: req.id,
      broker: req.broker.name,
      stage: config.stage,
      action: "follow_up_sent",
      displayName,
    });
  } catch (error) {
    const safeError =
      error instanceof Error ? error.message.slice(0, 500) : "Retry delivery failed";
    logBrokerEmailFailure(
      outboundMessage,
      safeError
    );

    // Record the failure and push nextRetryAt forward by FAILURE_BACKOFF_DAYS
    // to avoid retrying on every cron cycle
    const FAILURE_BACKOFF_DAYS = 1;
    const retryAfterFailure = new Date(
      now.getTime() + FAILURE_BACKOFF_DAYS * 24 * 60 * 60 * 1000
    );
    const reason = `follow_up_${config.stage}: delivery failed`;
    await prisma.$transaction([
      prisma.removalRequest.update({
        where: { id: req.id },
        data: {
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          lastError: safeError,
          lastRetryReason: reason,
          nextRetryAt: retryAfterFailure,
        },
      }),
      recordRetryAttempt({
        removalRequestId: req.id,
        stage: config.stage,
        action: "follow_up",
        outcome: "failed",
        reason,
        attemptedAt: now,
        nextRetryAt: retryAfterFailure,
        error: safeError,
      }),
    ]);

    throw error;
  }
}

// ─── Escalation ─────────────────────────────────────────────

async function escalateRequest(
  req: EligibleRequest,
  now: Date
): Promise<void> {
  const maxStage = Math.max(...RETRY_SCHEDULE.map((s) => s.stage));
  const reason = `No meaningful broker response after ${maxStage} retry stages; manual review required`;

  await prisma.$transaction([
    prisma.removalRequest.update({
      where: { id: req.id },
      data: {
        retryStage: maxStage,
        escalatedAt: now,
        escalationReason: reason,
        lastRetryReason: `escalated: retry schedule exhausted`,
        status: "requires_user_action",
        nextRetryAt: null,
      },
    }),
    recordRetryAttempt({
      removalRequestId: req.id,
      stage: maxStage,
      action: "escalate",
      outcome: "escalated",
      reason,
      attemptedAt: now,
      nextRetryAt: null,
    }),
  ]);

  console.info("[nuke][retry]", {
    requestId: req.id,
    broker: req.broker.name,
    stage: maxStage,
    action: "escalated",
  });
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Check whether the next retry is due based on the schedule.
 *
 * Uses nextRetryAt if set. Otherwise computes from lastAttemptAt/sentAt
 * and the next stage's delay.
 */
function isRetryDue(
  req: { retryStage: number; nextRetryAt: Date | null; lastAttemptAt: Date | null; sentAt: Date | null },
  now: Date
): boolean {
  // If nextRetryAt is explicitly set, use it
  if (req.nextRetryAt) {
    return now >= req.nextRetryAt;
  }

  // Otherwise compute from the schedule
  const nextStage = req.retryStage + 1;
  const config = RETRY_SCHEDULE.find((s) => s.stage === nextStage);
  if (!config) return false;

  const lastAction = req.lastAttemptAt ?? req.sentAt;
  if (!lastAction) return false;

  const dueAt = new Date(
    lastAction.getTime() + config.delayDays * 24 * 60 * 60 * 1000
  );
  return now >= dueAt;
}

/**
 * Check whether the removal request has a meaningful inbound response.
 * Meaningful = matched to this request with a non-noise classification.
 */
async function hasMeaningfulResponse(
  removalRequestId: string
): Promise<boolean> {
  const response = await prisma.inboundMessage.findFirst({
    where: {
      matchedRemovalRequestId: removalRequestId,
      classification: { in: MEANINGFUL_CLASSIFICATIONS },
    },
  });
  return !!response;
}

/**
 * Check whether the removal request has a pending user task.
 * If the user has an active task, automatic retries should not fire —
 * the task workflow controls what happens next.
 */
async function hasPendingUserTask(
  removalRequestId: string
): Promise<boolean> {
  const task = await prisma.userTask.findFirst({
    where: {
      removalRequestId,
      status: { in: ["pending", "pending_review"] },
    },
  });
  return !!task;
}

function recordRetryAttempt(input: RetryAttemptRecordInput) {
  return prisma.removalRetryAttempt.create({
    data: {
      removalRequestId: input.removalRequestId,
      stage: input.stage,
      action: input.action,
      outcome: input.outcome,
      reason: input.reason,
      attemptedAt: input.attemptedAt,
      nextRetryAt: input.nextRetryAt ?? null,
      providerMessageId: input.providerMessageId ?? null,
      outboundMessageId: input.outboundMessageId ?? null,
      error: input.error ?? null,
    },
  });
}
