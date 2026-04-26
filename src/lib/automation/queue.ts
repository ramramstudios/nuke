import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { processRemoval } from "@/lib/removal/engine";

interface AutomationQueueConfig {
  backoffBaseMs: number;
  concurrency: number;
  defaultMaxAttempts: number;
  maxJobsPerRun: number;
  perBrokerCooldownMs: number;
  staleLockMs: number;
}

export interface EnqueueAutomationJobsResult {
  enqueued: number;
  existing: number;
  skipped: number;
}

export interface AutomationQueueRunResult {
  completed: number;
  errors: number;
  retried: number;
  started: number;
  throttled: number;
}

interface QueueCandidate {
  id: string;
  attempts: number;
  maxAttempts: number;
  removalRequestId: string;
  removalRequest: {
    brokerId: string;
  };
}

export async function enqueueAutomationJobsForDeletionRequest(
  deletionRequestId: string
): Promise<EnqueueAutomationJobsResult> {
  const requests = await prisma.removalRequest.findMany({
    where: {
      deletionRequestId,
      method: "form",
      status: "pending",
    },
    select: {
      id: true,
    },
  });

  return enqueueAutomationJobsForRequests(requests.map((request) => request.id));
}

export async function enqueuePendingAutomationJobs(): Promise<EnqueueAutomationJobsResult> {
  const requests = await prisma.removalRequest.findMany({
    where: {
      deletionRequest: {
        status: "active",
      },
      method: "form",
      status: "pending",
    },
    select: {
      id: true,
    },
  });

  return enqueueAutomationJobsForRequests(requests.map((request) => request.id));
}

export async function enqueueAutomationJobsForRequests(
  removalRequestIds: string[]
): Promise<EnqueueAutomationJobsResult> {
  const uniqueIds = Array.from(new Set(removalRequestIds));
  const config = getAutomationQueueConfig();
  const now = new Date();
  let enqueued = 0;
  let existing = 0;
  let skipped = 0;

  for (const removalRequestId of uniqueIds) {
    const request = await prisma.removalRequest.findUnique({
      where: { id: removalRequestId },
      select: { method: true, status: true },
    });

    if (!request || request.method !== "form" || request.status !== "pending") {
      skipped++;
      continue;
    }

    const existingJob = await prisma.automationJob.findUnique({
      where: { removalRequestId },
      select: { id: true },
    });

    if (existingJob) {
      existing++;
      continue;
    }

    await prisma.automationJob.create({
      data: {
        maxAttempts: config.defaultMaxAttempts,
        nextRunAt: now,
        removalRequestId,
        status: "queued",
      },
    });
    enqueued++;
  }

  return { enqueued, existing, skipped };
}

export async function runAutomationQueue(options?: {
  lockId?: string;
  maxJobs?: number;
}): Promise<AutomationQueueRunResult> {
  const config = getAutomationQueueConfig();
  const lockId = options?.lockId ?? `automation-${randomUUID()}`;
  const maxJobs = Math.max(0, options?.maxJobs ?? config.maxJobsPerRun);
  const now = new Date();

  await releaseStaleAutomationLocks(now, config.staleLockMs);

  const candidates = await prisma.automationJob.findMany({
    where: {
      nextRunAt: { lte: now },
      status: "queued",
      removalRequest: {
        method: "form",
        status: "pending",
      },
    },
    select: {
      id: true,
      attempts: true,
      maxAttempts: true,
      removalRequestId: true,
      removalRequest: {
        select: {
          brokerId: true,
        },
      },
    },
    orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }, { createdAt: "asc" }],
    take: maxJobs,
  });

  const result: AutomationQueueRunResult = {
    completed: 0,
    errors: 0,
    retried: 0,
    started: 0,
    throttled: 0,
  };

  const active = new Set<Promise<void>>();
  const brokerIdsStartedThisRun = new Set<string>();

  for (const candidate of candidates) {
    if (active.size >= config.concurrency) {
      await Promise.race(active);
    }

    if (
      config.perBrokerCooldownMs > 0 &&
      (brokerIdsStartedThisRun.has(candidate.removalRequest.brokerId) ||
        (await isBrokerThrottled(candidate, now, config.perBrokerCooldownMs)))
    ) {
      result.throttled++;
      continue;
    }

    if (config.perBrokerCooldownMs > 0) {
      brokerIdsStartedThisRun.add(candidate.removalRequest.brokerId);
    }
    const work = processAutomationQueueJob(candidate, lockId, config)
      .then((outcome) => {
        result.started += outcome.started;
        result.completed += outcome.completed;
        result.retried += outcome.retried;
        result.errors += outcome.errors;
      })
      .catch(() => {
        result.errors++;
      })
      .finally(() => {
        active.delete(work);
      });

    active.add(work);
  }

  await Promise.all(active);

  return result;
}

async function processAutomationQueueJob(
  candidate: QueueCandidate,
  lockId: string,
  config: AutomationQueueConfig
): Promise<AutomationQueueRunResult> {
  const now = new Date();
  const acquired = await prisma.automationJob.updateMany({
    where: {
      id: candidate.id,
      status: "queued",
    },
    data: {
      attempts: { increment: 1 },
      lastStartedAt: now,
      lockedAt: now,
      lockedBy: lockId,
      status: "running",
    },
  });

  if (acquired.count === 0) {
    return emptyRunResult();
  }

  try {
    await processRemoval(candidate.removalRequestId);
    const processed = await prisma.removalRequest.findUnique({
      where: { id: candidate.removalRequestId },
      select: { status: true },
    });

    if (processed?.status === "pending") {
      throw new Error("Automation job finished but removal request is still pending.");
    }

    await prisma.automationJob.update({
      where: { id: candidate.id },
      data: {
        completedAt: new Date(),
        lastError: null,
        lastFinishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        status: "succeeded",
      },
    });

    return {
      completed: 1,
      errors: 0,
      retried: 0,
      started: 1,
      throttled: 0,
    };
  } catch (error) {
    const message = toSafeErrorMessage(error);
    const attemptsAfterRun = candidate.attempts + 1;
    const shouldRetry = attemptsAfterRun < candidate.maxAttempts;
    const nextRunAt = shouldRetry
      ? new Date(Date.now() + computeRetryBackoffMs(attemptsAfterRun, config))
      : new Date();

    await prisma.automationJob.update({
      where: { id: candidate.id },
      data: {
        lastError: message,
        lastFinishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        nextRunAt,
        status: shouldRetry ? "queued" : "failed",
      },
    });

    return {
      completed: 0,
      errors: shouldRetry ? 0 : 1,
      retried: shouldRetry ? 1 : 0,
      started: 1,
      throttled: 0,
    };
  }
}

async function isBrokerThrottled(
  candidate: QueueCandidate,
  now: Date,
  cooldownMs: number
): Promise<boolean> {
  if (cooldownMs <= 0) return false;

  const cutoff = new Date(now.getTime() - cooldownMs);
  const recent = await prisma.automationJob.findFirst({
    where: {
      id: { not: candidate.id },
      lastStartedAt: { gt: cutoff },
      removalRequest: {
        brokerId: candidate.removalRequest.brokerId,
      },
      status: {
        in: ["running", "succeeded", "queued", "failed"],
      },
    },
    select: { id: true },
    orderBy: { lastStartedAt: "desc" },
  });

  return Boolean(recent);
}

async function releaseStaleAutomationLocks(now: Date, staleLockMs: number) {
  const staleBefore = new Date(now.getTime() - staleLockMs);

  await prisma.automationJob.updateMany({
    where: {
      lockedAt: { lt: staleBefore },
      status: "running",
    },
    data: {
      lastError: "Automation job lock expired before completion.",
      lockedAt: null,
      lockedBy: null,
      nextRunAt: now,
      status: "queued",
    },
  });
}

function getAutomationQueueConfig(): AutomationQueueConfig {
  return {
    backoffBaseMs: parseInteger(process.env.AUTOMATION_QUEUE_BACKOFF_MS, 60_000),
    concurrency: Math.max(
      1,
      parseInteger(process.env.AUTOMATION_QUEUE_CONCURRENCY, 1)
    ),
    defaultMaxAttempts: Math.max(
      1,
      parseInteger(process.env.AUTOMATION_QUEUE_MAX_ATTEMPTS, 2)
    ),
    maxJobsPerRun: Math.max(
      1,
      parseInteger(process.env.AUTOMATION_QUEUE_MAX_JOBS_PER_RUN, 5)
    ),
    perBrokerCooldownMs: parseInteger(
      process.env.AUTOMATION_PER_BROKER_COOLDOWN_MS,
      60_000
    ),
    staleLockMs: parseInteger(
      process.env.AUTOMATION_QUEUE_STALE_LOCK_MS,
      10 * 60_000
    ),
  };
}

function computeRetryBackoffMs(
  attemptsAfterRun: number,
  config: AutomationQueueConfig
): number {
  return config.backoffBaseMs * Math.max(1, attemptsAfterRun);
}

function emptyRunResult(): AutomationQueueRunResult {
  return {
    completed: 0,
    errors: 0,
    retried: 0,
    started: 0,
    throttled: 0,
  };
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 500);
  }

  return "Automation queue job failed";
}
