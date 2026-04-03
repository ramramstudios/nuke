/**
 * Central Deletion Dispatcher (DROP-style)
 *
 * Takes a unified deletion request and fans it out to every active broker
 * in the registry, creating per-broker RemovalRequest records.
 */

import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";

interface DispatchResult {
  deletionRequestId: string;
  brokersDispatched: number;
}

/**
 * Submit a centralized deletion request.
 *
 * 1. Snapshot the user profile into the deletion request (encrypted)
 * 2. Fan out RemovalRequests to every active broker
 * 3. Return summary
 */
export async function submitDeletionRequest(
  userId: string
): Promise<DispatchResult> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw new Error("User profile not found — complete onboarding first");

  // Snapshot the profile data at submission time
  const payloadSnapshot = encryptJSON({
    fullNames: profile.fullNames,
    emails: profile.emails,
    phones: profile.phones,
    addresses: profile.addresses,
  });

  const deletionRequest = await prisma.deletionRequest.create({
    data: {
      userId,
      payloadSnapshot,
      status: "dispatching",
    },
  });

  // Fan out to all active brokers
  const brokers = await prisma.broker.findMany({ where: { active: true } });

  const removalRequests = brokers.map((broker) => ({
    deletionRequestId: deletionRequest.id,
    brokerId: broker.id,
    method: broker.removalMethod,
    status: "pending" as const,
    deadline: new Date(
      Date.now() + broker.slaInDays * 24 * 60 * 60 * 1000
    ),
  }));

  await prisma.removalRequest.createMany({ data: removalRequests });

  // Mark as active
  await prisma.deletionRequest.update({
    where: { id: deletionRequest.id },
    data: { status: "active" },
  });

  return {
    deletionRequestId: deletionRequest.id,
    brokersDispatched: brokers.length,
  };
}

/**
 * Distribute removal actions to brokers.
 * Called by the background job processor to actually execute removals.
 */
export async function distributeToBrokers(
  deletionRequestId: string
): Promise<void> {
  const requests = await prisma.removalRequest.findMany({
    where: { deletionRequestId, status: "pending" },
    include: { broker: true },
  });

  for (const req of requests) {
    // In MVP, simulate submission based on broker removal method
    const now = new Date();
    const deadline = new Date(
      now.getTime() + req.broker.slaInDays * 24 * 60 * 60 * 1000
    );

    switch (req.broker.removalMethod) {
      case "api":
        // TODO: Real API integration
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: { status: "submitted", submittedAt: now, deadline },
        });
        break;

      case "form":
        // TODO: Playwright form automation
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: { status: "submitted", submittedAt: now, deadline },
        });
        break;

      case "email":
        // TODO: Send deletion email
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: { status: "submitted", submittedAt: now, deadline },
        });
        break;

      case "manual_link":
        await prisma.removalRequest.update({
          where: { id: req.id },
          data: {
            status: "requires_user_action",
            removalUrl: req.broker.removalEndpoint,
            submittedAt: now,
            deadline,
          },
        });
        break;
    }
  }
}
