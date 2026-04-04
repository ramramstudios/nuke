/**
 * Removal Engine
 *
 * Processes pending RemovalRequests using the priority chain:
 *   1. API call
 *   2. Form automation (Playwright)
 *   3. Email request
 *   4. Fallback: discover user-actionable link
 *
 * MVP: API/form methods are still simulated. Email brokers can now use
 * a phase 1 outbound delivery flow, while broker responses remain simulated.
 */

import { prisma } from "@/lib/db";
import { buildBrokerDeletionEmail } from "@/lib/removal/email-template";
import {
  deliverBrokerEmail,
  logBrokerEmailFailure,
} from "@/lib/removal/email-delivery";
import { decodeRemovalProfileSnapshot } from "@/lib/removal/profile";

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
        await attemptFormRemoval(req.broker.removalEndpoint);
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: { status: "submitted", submittedAt: now, deadline },
        });
        break;

      case "email": {
        const emailResult = await sendDeletionEmail({
          brokerName: req.broker.name,
          payloadSnapshot: req.deletionRequest.payloadSnapshot,
          requestId: req.id,
          to: req.broker.removalEndpoint,
        });
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
    await prisma.removalRequest.update({
      where: { id: req.id },
      data: {
        status: "requires_user_action",
        removalUrl: fallbackUrl,
        method: "manual_link",
        submittedAt: now,
        deadline,
        ...(req.method === "email"
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

async function attemptFormRemoval(endpoint: string | null): Promise<void> {
  // TODO: Playwright browser automation
  if (!endpoint) throw new Error("No form endpoint configured");
  await delay(200);
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
