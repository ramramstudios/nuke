/**
 * Communication Timeline
 *
 * Assembles a unified, chronological event log for a single RemovalRequest
 * by combining milestones from the request itself, outbound retries, inbound
 * broker replies, and generated user tasks.
 */

import { prisma } from "@/lib/db";
import {
  decodeRemovalProfileSnapshot,
  getPrimaryRemovalEmail,
} from "@/lib/removal/profile";

export type TimelineEventType =
  | "submitted"
  | "email_sent"
  | "watch_inbox"
  | "retry_sent"
  | "retry_failed"
  | "escalated"
  | "inbound_reply"
  | "task_created"
  | "task_resolved"
  | "acknowledged"
  | "completed"
  | "rejected"
  | "requires_user_action"
  | "manual_fallback";

export type TimelineTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  occurredAt: string; // ISO 8601
  title: string;
  description: string;
  tone: TimelineTone;
  metadata?: {
    brokerName?: string;
    method?: string;
    classification?: string;
    classificationConfidence?: number;
    actionType?: string;
    actionUrl?: string;
    failureReason?: string;
    providerMessageId?: string;
    outboundMessageId?: string;
    retryStage?: number;
    replyToAddress?: string;
    excerpt?: string;
  };
}

/**
 * Build the full communication timeline for a single removal request.
 * Returns null if the request does not belong to the given user.
 */
export async function getRequestTimeline(
  requestId: string,
  userId: string
): Promise<TimelineEvent[] | null> {
  const request = await prisma.removalRequest.findFirst({
    where: {
      id: requestId,
      deletionRequest: { userId },
    },
    include: {
      broker: true,
      deletionRequest: {
        select: { payloadSnapshot: true },
      },
      retryAttempts: { orderBy: { attemptedAt: "asc" } },
      inboundMessages: { orderBy: { receivedAt: "asc" } },
      tasks: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!request) return null;

  const events: TimelineEvent[] = [];
  const brokerName = request.broker.name;
  const method = request.method;
  const replyToAddress = getReplyToAddress(request.deletionRequest.payloadSnapshot);

  // ── 1. Submission milestone ──────────────────────────────────────────────
  const submittedAt = request.submittedAt ?? request.createdAt;
  events.push({
    id: `${request.id}-submitted`,
    type: "submitted",
    occurredAt: submittedAt.toISOString(),
    title: "Removal request submitted",
    description: `A removal request was opened for ${brokerName}. Method: ${humanMethod(method)}.`,
    tone: "neutral",
    metadata: { brokerName, method },
  });

  // ── 2. Outbound email sent ───────────────────────────────────────────────
  if (request.sentAt) {
    events.push({
      id: `${request.id}-email_sent`,
      type: "email_sent",
      occurredAt: request.sentAt.toISOString(),
      title: "Opt-out email sent to broker",
      description: `An opt-out email was delivered to ${brokerName}.`,
      tone: "info",
      metadata: {
        brokerName,
        providerMessageId: request.providerMessageId ?? undefined,
        outboundMessageId: request.outboundMessageId ?? undefined,
      },
    });

    if (method === "email" && replyToAddress) {
      events.push({
        id: `${request.id}-watch_inbox`,
        type: "watch_inbox",
        occurredAt: request.sentAt.toISOString(),
        title: "Monitor your personal inbox",
        description: `${brokerName} may reply directly to ${replyToAddress} instead of back into NUKE. Watch for identity checks, confirmation links, or completion notices there.`,
        tone: "warning",
        metadata: {
          brokerName,
          replyToAddress,
        },
      });
    }
  }

  // ── 3. Manual fallback switch ────────────────────────────────────────────
  if (method === "manual_link" && request.lastError) {
    const occurredAt = (request.lastAttemptAt ?? request.updatedAt).toISOString();
    events.push({
      id: `${request.id}-manual_fallback`,
      type: "manual_fallback",
      occurredAt,
      title: "Switched to manual opt-out link",
      description: `Automated email delivery failed for ${brokerName}. The request has been switched to a direct broker opt-out link for manual follow-up.`,
      tone: "warning",
      metadata: {
        brokerName,
        failureReason: request.lastError ?? undefined,
      },
    });
  }

  // ── 4. Retry attempts ────────────────────────────────────────────────────
  for (const attempt of request.retryAttempts) {
    if (attempt.outcome === "sent") {
      events.push({
        id: `retry-${attempt.id}`,
        type: "retry_sent",
        occurredAt: attempt.attemptedAt.toISOString(),
        title: stageLabel(attempt.stage) + " follow-up sent",
        description: `A follow-up email was sent to ${brokerName}. Reason: ${attempt.reason}.`,
        tone: "info",
        metadata: {
          brokerName,
          retryStage: attempt.stage,
          providerMessageId: attempt.providerMessageId ?? undefined,
          outboundMessageId: attempt.outboundMessageId ?? undefined,
        },
      });
    } else if (attempt.outcome === "failed") {
      events.push({
        id: `retry-${attempt.id}`,
        type: "retry_failed",
        occurredAt: attempt.attemptedAt.toISOString(),
        title: stageLabel(attempt.stage) + " follow-up failed",
        description: `A retry attempt for ${brokerName} could not be delivered.`,
        tone: "danger",
        metadata: {
          brokerName,
          retryStage: attempt.stage,
          failureReason: attempt.error ?? undefined,
        },
      });
    } else if (attempt.outcome === "escalated") {
      events.push({
        id: `retry-${attempt.id}`,
        type: "escalated",
        occurredAt: attempt.attemptedAt.toISOString(),
        title: "Request escalated",
        description: `Automated follow-ups for ${brokerName} have been exhausted. The request has been flagged for escalation.`,
        tone: "warning",
        metadata: {
          brokerName,
          retryStage: attempt.stage,
          failureReason: attempt.reason,
        },
      });
    }
  }

  // ── 5. Escalation milestone (from request fields, if not covered above) ──
  if (
    request.escalatedAt &&
    !request.retryAttempts.some((a) => a.outcome === "escalated")
  ) {
    events.push({
      id: `${request.id}-escalated`,
      type: "escalated",
      occurredAt: request.escalatedAt.toISOString(),
      title: "Request escalated",
      description:
        request.escalationReason
          ? `${brokerName}: ${request.escalationReason}`
          : `Automated follow-ups for ${brokerName} have been exhausted and the request has been escalated.`,
      tone: "warning",
      metadata: { brokerName },
    });
  }

  // ── 6. Inbound broker replies ────────────────────────────────────────────
  for (const msg of request.inboundMessages) {
    const classification = msg.classification ?? "unknown";
    const tone = classificationTone(classification);
    const title = classificationTitle(classification, brokerName);
    const excerpt = buildExcerpt(msg.textBody ?? msg.htmlBody ?? "");

    events.push({
      id: `inbound-${msg.id}`,
      type: "inbound_reply",
      occurredAt: msg.receivedAt.toISOString(),
      title,
      description:
        excerpt
          ? `${brokerName} replied. ${excerpt}`
          : `${brokerName} sent a reply email.`,
      tone,
      metadata: {
        brokerName,
        classification,
        classificationConfidence: msg.classificationConfidence ?? undefined,
        excerpt: excerpt || undefined,
        providerMessageId: msg.providerMessageId ?? undefined,
      },
    });
  }

  // ── 7. User tasks ────────────────────────────────────────────────────────
  for (const task of request.tasks) {
    events.push({
      id: `task-created-${task.id}`,
      type: "task_created",
      occurredAt: task.createdAt.toISOString(),
      title: `Action required: ${task.title}`,
      description: shortInstructions(task.instructions),
      tone: "warning",
      metadata: {
        brokerName: brokerName,
        actionType: task.actionType,
        actionUrl: task.actionUrl ?? undefined,
      },
    });

    if (task.status === "completed" || task.status === "dismissed") {
      events.push({
        id: `task-resolved-${task.id}`,
        type: "task_resolved",
        occurredAt: task.updatedAt.toISOString(),
        title:
          task.status === "completed"
            ? `Task marked done: ${task.title}`
            : `Task dismissed: ${task.title}`,
        description:
          task.status === "completed"
            ? "You marked this action item as completed."
            : "You dismissed this action item.",
        tone: task.status === "completed" ? "success" : "neutral",
        metadata: { brokerName },
      });
    }
  }

  // ── 8. Status milestones ─────────────────────────────────────────────────
  if (request.acknowledgedAt) {
    events.push({
      id: `${request.id}-acknowledged`,
      type: "acknowledged",
      occurredAt: request.acknowledgedAt.toISOString(),
      title: "Broker acknowledged the request",
      description: `${brokerName} confirmed receipt of the removal request.`,
      tone: "success",
      metadata: { brokerName },
    });
  }

  if (request.completedAt) {
    events.push({
      id: `${request.id}-completed`,
      type: "completed",
      occurredAt: request.completedAt.toISOString(),
      title: "Removal completed",
      description: `${brokerName} has completed the removal of your data.`,
      tone: "success",
      metadata: { brokerName },
    });
  }

  if (request.status === "rejected" && !request.completedAt) {
    events.push({
      id: `${request.id}-rejected`,
      type: "rejected",
      occurredAt: request.updatedAt.toISOString(),
      title: "Request rejected",
      description: request.rejectionReason
        ? `${brokerName} rejected the request: ${request.rejectionReason}`
        : `${brokerName} rejected the removal request.`,
      tone: "danger",
      metadata: { brokerName },
    });
  }

  if (request.status === "requires_user_action" && request.tasks.length === 0) {
    events.push({
      id: `${request.id}-requires_user_action`,
      type: "requires_user_action",
      occurredAt: request.updatedAt.toISOString(),
      title: "Action required",
      description: `${brokerName} requires additional information before completing the removal.`,
      tone: "warning",
      metadata: { brokerName },
    });
  }

  // Sort chronologically
  events.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  return events;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function humanMethod(method: string): string {
  const map: Record<string, string> = {
    email: "Email opt-out",
    form: "Form submission",
    api: "API request",
    manual_link: "Manual opt-out link",
  };
  return map[method] ?? method.replace(/_/g, " ");
}

function stageLabel(stage: number): string {
  if (stage === 1) return "First";
  if (stage === 2) return "Second";
  if (stage >= 3) return "Final";
  return "Follow-up";
}

function classificationTone(classification: string): TimelineTone {
  switch (classification) {
    case "completion":
      return "success";
    case "acknowledgment":
      return "success";
    case "rejection":
      return "danger";
    case "needs_more_info":
      return "warning";
    case "noise":
      return "neutral";
    default:
      return "info";
  }
}

function classificationTitle(classification: string, brokerName: string): string {
  switch (classification) {
    case "completion":
      return `${brokerName} confirmed removal`;
    case "acknowledgment":
      return `${brokerName} acknowledged the request`;
    case "rejection":
      return `${brokerName} rejected the request`;
    case "needs_more_info":
      return `${brokerName} needs more information`;
    case "noise":
      return `Auto-reply received from ${brokerName}`;
    default:
      return `Reply received from ${brokerName}`;
  }
}

function buildExcerpt(body: string, maxLength = 160): string {
  // Strip HTML tags if present
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function shortInstructions(instructions: string, maxLength = 200): string {
  // Strip broker excerpt section that is appended by generate.ts
  const trimmed = instructions.split("\n\nBroker message excerpt:")[0].trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function getReplyToAddress(payloadSnapshot: string): string | null {
  try {
    return getPrimaryRemovalEmail(decodeRemovalProfileSnapshot(payloadSnapshot));
  } catch {
    return null;
  }
}
