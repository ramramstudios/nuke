/**
 * Removal Engine
 *
 * Processes pending RemovalRequests using the priority chain:
 *   1. API call
 *   2. Form automation (Playwright)
 *   3. Email request
 *   4. Fallback: discover user-actionable link
 *
 * MVP: all methods are simulated. Each case updates the request status
 * so the dashboard and compliance tracker can reflect progress.
 */

import { prisma } from "@/lib/db";

/**
 * Process a single removal request.
 */
export async function processRemoval(requestId: string): Promise<void> {
  const req = await prisma.removalRequest.findUnique({
    where: { id: requestId },
    include: { broker: true },
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

      case "email":
        await sendDeletionEmail(req.broker.removalEndpoint);
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: { status: "submitted", submittedAt: now, deadline },
        });
        break;

      case "manual_link":
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
  } catch (error) {
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
      },
    });
  }
}

/**
 * Process all pending removal requests for a deletion request.
 */
export async function processAllPending(
  deletionRequestId: string
): Promise<{ processed: number }> {
  const pending = await prisma.removalRequest.findMany({
    where: { deletionRequestId, status: "pending" },
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

async function sendDeletionEmail(emailAddress: string | null): Promise<void> {
  // TODO: Send via SMTP/transactional email service
  if (!emailAddress) throw new Error("No email address configured");
  await delay(100);
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
  return `Subject: Personal Data Deletion Request — ${userName}

To Whom It May Concern,

I am writing to request the deletion of all personal information you hold about me, pursuant to my rights under the California Consumer Privacy Act (CCPA), the General Data Protection Regulation (GDPR), and any other applicable data protection laws.

My details:
Name: ${userName}

Please confirm within 45 days that:
1. All my personal data has been identified
2. All personal data has been permanently deleted
3. Any third parties with whom my data was shared have been notified

If you are unable to fulfill this request, please provide a detailed explanation.

Thank you for your prompt attention to this matter.

Sincerely,
${userName}`;
}
