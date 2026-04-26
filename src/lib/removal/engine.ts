/**
 * Removal Engine
 *
 * Processes pending RemovalRequests using the priority chain:
 *   1. API call
 *   2. Form automation (Playwright)
 *   3. Email request
 *   4. Fallback: discover user-actionable link
 *
 * API methods are still simulated. Form brokers now have a gated
 * Playwright foundation, but broker-specific runners are still added
 * incrementally. Email brokers can use the phase 1 outbound delivery flow.
 */

import { prisma } from "@/lib/db";
import { classifyAutomationFailure } from "@/lib/automation/challenges";
import { isFormAutomationEnabled } from "@/lib/automation/config";
import {
  runBrokerFormAutomation,
} from "@/lib/automation/form-runners";
import type { BrokerFormAutomationResult } from "@/lib/automation/types";
import { buildBrokerDeletionEmail } from "@/lib/removal/email-template";
import {
  deliverBrokerEmail,
  logBrokerEmailFailure,
} from "@/lib/removal/email-delivery";
import { decodeRemovalProfileSnapshot } from "@/lib/removal/profile";
import { RETRY_SCHEDULE } from "@/lib/removal/retry";
import {
  dismissAutomationTasksForRemovalRequest,
  syncAutomationTaskForBlockedForm,
} from "@/lib/tasks/automation";

/**
 * Process a single removal request.
 */
export async function processRemoval(requestId: string): Promise<void> {
  const req = await prisma.removalRequest.findUnique({
    where: { id: requestId },
    include: {
      broker: true,
      deletionRequest: {
        select: { payloadSnapshot: true },
      },
    },
  });
  if (!req || req.status !== "pending") return;

  const now = new Date();
  const deadline = new Date(
    now.getTime() + req.broker.slaInDays * 24 * 60 * 60 * 1000
  );

  try {
    switch (req.method) {
      case "api":
        await attemptApiRemoval(req.broker.removalEndpoint);
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: { status: "submitted", submittedAt: now, deadline },
        });
        break;

      case "form":
        await finalizeFormRemoval(
          req.id,
          await attemptFormRemoval({
            brokerDomain: req.broker.domain,
            brokerName: req.broker.name,
            endpoint: req.broker.removalEndpoint,
            payloadSnapshot: req.deletionRequest.payloadSnapshot,
            requestId: req.id,
          }),
          now,
          deadline
        );
        break;

      case "email": {
        const emailResult = await sendDeletionEmail({
          brokerName: req.broker.name,
          payloadSnapshot: req.deletionRequest.payloadSnapshot,
          requestId: req.id,
          to: req.broker.removalEndpoint,
        });
        // Compute when the first retry follow-up becomes eligible
        const firstRetry = RETRY_SCHEDULE.find((s) => s.stage === 1);
        const nextRetryAt = firstRetry
          ? new Date(now.getTime() + firstRetry.delayDays * 24 * 60 * 60 * 1000)
          : null;
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: {
            status: "submitted",
            submittedAt: now,
            sentAt: now,
            deadline,
            outboundMessageId: emailResult.outboundMessageId ?? null,
            providerMessageId: emailResult.providerMessageId,
            lastError: null,
            lastAttemptAt: now,
            attemptCount: { increment: 1 },
            nextRetryAt,
          },
        });
        break;
      }

      case "manual_link": {
        const removalUrl = await discoverRemovalLink(req.broker.domain);
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: {
            status: "requires_user_action",
            removalUrl,
            submittedAt: now,
            deadline,
          },
        });
        break;
      }
    }
  } catch (error) {
    const safeError = toSafeErrorMessage(error);
    // If primary method fails, try fallback to manual link
    const fallbackUrl = await discoverRemovalLink(req.broker.domain);
    if (req.method === "form") {
      await finalizeFailedFormRemoval({
        brokerName: req.broker.name,
        deadline,
        fallbackUrl,
        reason: safeError,
        requestId: req.id,
        now,
      });
      return;
    }

    await prisma.removalRequest.update({
      where: { id: req.id },
      data: {
        status: "requires_user_action",
        removalUrl: fallbackUrl,
        method: "manual_link",
        submittedAt: now,
        deadline,
        ...((req.method === "email" || req.method === "form")
          ? {
              lastError: safeError,
              lastAttemptAt: now,
              attemptCount: { increment: 1 },
            }
          : {}),
      },
    });
  }
}

/**
 * Process all pending removal requests for a deletion request.
 */
export async function processAllPending(
  deletionRequestId: string,
  options?: { methods?: string[] }
): Promise<{ processed: number }> {
  const pending = await prisma.removalRequest.findMany({
    where: {
      deletionRequestId,
      status: "pending",
      ...(options?.methods ? { method: { in: options.methods } } : {}),
    },
  });

  for (const req of pending) {
    await processRemoval(req.id);
  }

  return { processed: pending.length };
}

// ─── Method Implementations (MVP stubs) ─────────────────────

async function attemptApiRemoval(endpoint: string | null): Promise<void> {
  // TODO: Real HTTP DELETE/POST to broker API
  if (!endpoint) throw new Error("No API endpoint configured");
  // Simulate network call
  await delay(100);
}

async function attemptFormRemoval(input: {
  brokerDomain: string;
  brokerName: string;
  endpoint: string | null;
  payloadSnapshot: string;
  requestId: string;
}): Promise<BrokerFormAutomationResult> {
  if (!input.endpoint) throw new Error("No form endpoint configured");

  if (!isFormAutomationEnabled()) {
    // Keep the current MVP behavior until broker-specific runners land.
    await delay(200);
    return {
      outcome: {
        status: "submitted",
      },
      run: {
        brokerDomain: input.brokerDomain,
        brokerName: input.brokerName,
        entryUrl: input.endpoint,
        errorMessage: null,
        finalUrl: input.endpoint,
        finishedAt: new Date().toISOString(),
        logEntries: 0,
        logPath: "",
        metadataPath: "",
        pageTitle: null,
        runDir: "",
        runId: "",
        screenshots: [],
        startedAt: new Date().toISOString(),
        status: "succeeded",
        tracePath: null,
      },
    };
  }

  const profile = decodeRemovalProfileSnapshot(input.payloadSnapshot);

  return runBrokerFormAutomation({
    brokerDomain: input.brokerDomain,
    brokerName: input.brokerName,
    entryUrl: input.endpoint,
    profile,
    requestId: input.requestId,
  });
}

async function finalizeFormRemoval(
  requestId: string,
  result: BrokerFormAutomationResult,
  now: Date,
  deadline: Date
): Promise<void> {
  if (result.outcome.status === "requires_user_action") {
    await prisma.removalRequest.update({
      where: { id: requestId },
      data: {
        status: "requires_user_action",
        removalUrl: result.outcome.removalUrl ?? null,
        submittedAt: now,
        deadline,
        lastError: result.outcome.reason ?? null,
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
      },
    });
    await syncAutomationTaskForBlockedForm({
      removalRequestId: requestId,
      blockerType: result.outcome.blockerType,
      reason:
        result.outcome.reason ??
        "The broker flow still needs a manual step before it can continue.",
      actionUrl: result.outcome.removalUrl ?? null,
      occurredAt: now,
    });
    return;
  }

  await prisma.removalRequest.update({
    where: { id: requestId },
    data: {
      status: "submitted",
      removalUrl: result.outcome.removalUrl ?? null,
      submittedAt: now,
      deadline,
      lastError: null,
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
    },
  });
  await dismissAutomationTasksForRemovalRequest(requestId);
}

async function finalizeFailedFormRemoval(input: {
  brokerName: string;
  deadline: Date;
  fallbackUrl: string;
  reason: string;
  requestId: string;
  now: Date;
}): Promise<void> {
  const blocker = classifyAutomationFailure(input.reason, input.brokerName);

  await prisma.removalRequest.update({
    where: { id: input.requestId },
    data: {
      status: "requires_user_action",
      removalUrl: input.fallbackUrl,
      submittedAt: input.now,
      deadline: input.deadline,
      lastError: blocker.reason,
      lastAttemptAt: input.now,
      attemptCount: { increment: 1 },
    },
  });

  await syncAutomationTaskForBlockedForm({
    removalRequestId: input.requestId,
    blockerType: blocker.blockerType,
    reason: blocker.reason,
    actionUrl: input.fallbackUrl,
    occurredAt: input.now,
  });
}

async function sendDeletionEmail(input: {
  brokerName: string;
  payloadSnapshot: string;
  requestId: string;
  to: string | null;
}): Promise<{ outboundMessageId?: string; providerMessageId: string }> {
  if (!input.to) throw new Error("No email address configured");

  const profile = decodeRemovalProfileSnapshot(input.payloadSnapshot);
  const message = buildBrokerDeletionEmail(profile, input.brokerName);

  const outboundMessage = {
    brokerName: input.brokerName,
    requestId: input.requestId,
    to: input.to,
    subject: message.subject,
    text: message.text,
    replyTo: message.replyTo,
  };

  try {
    const result = await deliverBrokerEmail(outboundMessage);
    return {
      outboundMessageId: result.outboundMessageId,
      providerMessageId: result.providerMessageId,
    };
  } catch (error) {
    logBrokerEmailFailure(outboundMessage, toSafeErrorMessage(error));
    throw error;
  }
}

/**
 * Discover the opt-out / privacy removal link for a given domain.
 * MVP: returns common privacy URL patterns.
 * Production: would crawl the site and look for CCPA/GDPR links.
 */
async function discoverRemovalLink(domain: string): Promise<string> {
  // Common patterns for privacy/opt-out pages
  const patterns = [
    `/privacy`,
    `/opt-out`,
    `/do-not-sell`,
    `/ccpa`,
    `/data-request`,
    `/removal`,
  ];

  // MVP: return the most common pattern
  return `https://${domain}${patterns[0]}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Email Template Generator ───────────────────────────────

export function generateDeletionEmailTemplate(
  userName: string,
  brokerName: string
): string {
  return buildBrokerDeletionEmail(
    {
      fullNames: [userName],
      emails: [],
      phones: [],
      addresses: [],
      advertisingIds: [],
      vin: null,
    },
    brokerName
  ).text;
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 500);
  }

  return "Outbound request failed";
}
