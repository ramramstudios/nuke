/**
 * Compliance & Status Tracker
 *
 * Monitors broker response deadlines, flags overdue requests,
 * and provides summary statistics for the dashboard.
 */

import { prisma } from "@/lib/db";
import {
  decodeRemovalProfileSnapshot,
  getPrimaryRemovalEmail,
} from "@/lib/removal/profile";

export interface ComplianceSummary {
  total: number;
  pending: number;
  submitted: number;
  acknowledged: number;
  completed: number;
  rejected: number;
  requiresUserAction: number;
  overdue: number;
}

/**
 * Get compliance summary for a user's active deletion request.
 */
export async function getComplianceSummary(
  userId: string
): Promise<ComplianceSummary> {
  const requests = await prisma.removalRequest.findMany({
    where: {
      deletionRequest: { userId },
    },
  });

  const now = new Date();
  const summary: ComplianceSummary = {
    total: requests.length,
    pending: 0,
    submitted: 0,
    acknowledged: 0,
    completed: 0,
    rejected: 0,
    requiresUserAction: 0,
    overdue: 0,
  };

  for (const req of requests) {
    switch (req.status) {
      case "pending":
        summary.pending++;
        break;
      case "submitted":
        summary.submitted++;
        break;
      case "acknowledged":
        summary.acknowledged++;
        break;
      case "completed":
        summary.completed++;
        break;
      case "rejected":
        summary.rejected++;
        break;
      case "requires_user_action":
        summary.requiresUserAction++;
        break;
    }

    // Check if overdue
    if (
      req.deadline &&
      now > req.deadline &&
      !["completed", "rejected"].includes(req.status)
    ) {
      summary.overdue++;
    }
  }

  return summary;
}

/**
 * Check all active requests and flag those past their SLA deadline.
 */
export async function flagOverdueRequests(): Promise<number> {
  const now = new Date();
  const result = await prisma.removalRequest.updateMany({
    where: {
      deadline: { lt: now },
      status: { in: ["submitted", "acknowledged"] },
    },
    data: {}, // In production: set an `overdue` flag or send notifications
  });
  return result.count;
}

/**
 * Simulate broker responses for MVP demo purposes.
 * Randomly advances some submitted requests to acknowledged/completed.
 */
export async function simulateBrokerResponses(): Promise<{
  acknowledged: number;
  completed: number;
}> {
  let acknowledged = 0;
  let completed = 0;

  // Move some "submitted" → "acknowledged"
  const submitted = await prisma.removalRequest.findMany({
    where: { status: "submitted" },
  });
  for (const req of submitted) {
    if (Math.random() < 0.3) {
      await prisma.removalRequest.update({
        where: { id: req.id },
        data: { status: "acknowledged", acknowledgedAt: new Date() },
      });
      acknowledged++;
    }
  }

  // Move some "acknowledged" → "completed"
  const acked = await prisma.removalRequest.findMany({
    where: { status: "acknowledged" },
  });
  for (const req of acked) {
    if (Math.random() < 0.2) {
      await prisma.removalRequest.update({
        where: { id: req.id },
        data: { status: "completed", completedAt: new Date() },
      });
      completed++;
    }
  }

  return { acknowledged, completed };
}

/**
 * Get detailed request statuses for a user, grouped by broker.
 */
export async function getDetailedStatus(userId: string) {
  const requests = await prisma.removalRequest.findMany({
    where: { deletionRequest: { userId } },
    include: {
      broker: true,
      deletionRequest: {
        select: { payloadSnapshot: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map(({ deletionRequest, ...req }) => ({
    ...req,
    replyToAddress: getReplyToAddress(deletionRequest.payloadSnapshot),
  }));
}

function getReplyToAddress(payloadSnapshot: string): string | null {
  try {
    return getPrimaryRemovalEmail(decodeRemovalProfileSnapshot(payloadSnapshot));
  } catch {
    return null;
  }
}
