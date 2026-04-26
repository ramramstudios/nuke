import { prisma } from "@/lib/db";
import type { BrokerFormAutomationResult } from "@/lib/automation/types";

export async function persistFormAutomationEvidence(input: {
  removalRequestId: string;
  result: BrokerFormAutomationResult;
}): Promise<void> {
  const { outcome, run } = input.result;

  if (!run.runId || !run.runDir) {
    return;
  }

  await prisma.automationEvidence.upsert({
    where: {
      runId: run.runId,
    },
    create: {
      actionUrl: outcome.removalUrl ?? null,
      blockerType: outcome.blockerType ?? null,
      brokerDomain: run.brokerDomain,
      brokerName: run.brokerName,
      entryUrl: run.entryUrl,
      finalUrl: run.finalUrl,
      finishedAt: new Date(run.finishedAt),
      kind: "form_automation",
      logEntries: run.logEntries,
      logPath: run.logPath || null,
      metadataPath: run.metadataPath || null,
      outcomeStatus: outcome.status,
      pageTitle: run.pageTitle,
      reason: outcome.reason ?? run.errorMessage,
      removalRequestId: input.removalRequestId,
      runDir: run.runDir,
      runId: run.runId,
      runStatus: run.status,
      screenshotCount: run.screenshots.length,
      screenshots: JSON.stringify(run.screenshots),
      startedAt: new Date(run.startedAt),
      tracePath: run.tracePath,
    },
    update: {
      actionUrl: outcome.removalUrl ?? null,
      blockerType: outcome.blockerType ?? null,
      finalUrl: run.finalUrl,
      finishedAt: new Date(run.finishedAt),
      logEntries: run.logEntries,
      logPath: run.logPath || null,
      metadataPath: run.metadataPath || null,
      outcomeStatus: outcome.status,
      pageTitle: run.pageTitle,
      reason: outcome.reason ?? run.errorMessage,
      runDir: run.runDir,
      runStatus: run.status,
      screenshotCount: run.screenshots.length,
      screenshots: JSON.stringify(run.screenshots),
      startedAt: new Date(run.startedAt),
      tracePath: run.tracePath,
    },
  });
}
