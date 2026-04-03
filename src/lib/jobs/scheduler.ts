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
import { runScan } from "@/lib/crawler/scanner";
import { processAllPending } from "@/lib/removal/engine";
import { flagOverdueRequests, simulateBrokerResponses } from "@/lib/compliance/tracker";

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
    const result = await processAllPending(dr.id);
    total += result.processed;
  }

  return { processed: total };
}

/**
 * Run all periodic maintenance tasks (call from cron endpoint).
 */
export async function runMaintenanceCycle() {
  const overdue = await flagOverdueRequests();
  const simulated = await simulateBrokerResponses();
  const scans = await runRecurringScans();
  const removals = await processAllPendingRemovals();

  return {
    overdueChecked: overdue,
    simulated,
    scans,
    removals,
  };
}
