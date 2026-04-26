/**
 * Background Job Scheduler
 *
 * Defines recurring jobs for:
 *   - Re-scanning users for data re-exposure
 *   - Processing pending removal requests
 *   - Checking broker compliance deadlines
 *   - Simulating broker responses (MVP only)
 *
 * Production: use BullMQ with Redis.
 * MVP: exports functions that can be called from API routes or cron.
 */

import { prisma } from "@/lib/db";
import { isFormAutomationEnabled } from "@/lib/automation/config";
import {
  enqueuePendingAutomationJobs,
  runAutomationQueue,
} from "@/lib/automation/queue";
import { runScan } from "@/lib/crawler/scanner";
import { processAllPending } from "@/lib/removal/engine";
import { flagOverdueRequests, simulateBrokerResponses } from "@/lib/compliance/tracker";
import { processRetries } from "@/lib/removal/retry";

/**
 * Re-scan all users who haven't been scanned in SCAN_INTERVAL_DAYS.
 */
export async function runRecurringScans(): Promise<{ scanned: number }> {
  const intervalDays = parseInt(process.env.SCAN_INTERVAL_DAYS || "30", 10);
  const cutoff = new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      profile: { isNot: null },
      scans: {
        none: { createdAt: { gt: cutoff } },
      },
    },
    select: { id: true },
  });

  let scanned = 0;
  for (const user of users) {
    await runScan(user.id);
    scanned++;
  }

  return { scanned };
}

/**
 * Process all pending removals across all active deletion requests.
 */
export async function processAllPendingRemovals(): Promise<{ processed: number }> {
  const active = await prisma.deletionRequest.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  let total = 0;
  for (const dr of active) {
    const result = await processAllPending(dr.id, { methods: ["email"] });
    total += result.processed;
  }

  return { processed: total };
}

export async function processAutomationJobs() {
  if (!isFormAutomationEnabled()) {
    return {
      enqueue: { enqueued: 0, existing: 0, skipped: 0 },
      run: { completed: 0, errors: 0, retried: 0, started: 0, throttled: 0 },
    };
  }

  const enqueue = await enqueuePendingAutomationJobs();
  const run = await runAutomationQueue();

  return { enqueue, run };
}

/**
 * Run all periodic maintenance tasks (call from cron endpoint).
 */
export async function runMaintenanceCycle() {
  const overdue = await flagOverdueRequests();
  const scans = await runRecurringScans();
  const removals = await processAllPendingRemovals();
  const automationQueue = await processAutomationJobs();
  const retries = await processRetries();

  // MVP simulator only runs when explicitly enabled.
  // It randomly advances submitted requests, which would bypass the
  // no-response retry policy in non-demo environments.
  const enableSimulation = process.env.ENABLE_BROKER_SIMULATION === "true";
  const simulated = enableSimulation
    ? await simulateBrokerResponses()
    : { acknowledged: 0, completed: 0 };

  return {
    overdueChecked: overdue,
    simulated,
    scans,
    removals,
    automationQueue,
    retries,
  };
}
