import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  ClassificationLabel,
  ClassificationSignal,
  MatchSignal,
  MatchStatus,
} from "@/lib/communications/types";
import type { TaskActionType } from "@/lib/tasks/generate";

export type ReviewResolutionAction =
  | "mark_acknowledged"
  | "mark_completed"
  | "mark_rejected"
  | "request_user_action"
  | "dismiss_noise";

export interface ReviewQueueItem {
  id: string;
  receivedAt: string;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  excerpt: string;
  matchStatus: MatchStatus;
  matchConfidence: number | null;
  classification: ClassificationLabel | null;
  classificationConfidence: number | null;
  reviewReason: string;
  broker: {
    name: string;
    domain: string;
  } | null;
  request:
    | {
        id: string;
        status: string;
        submittedAt: string | null;
      }
    | null;
  pendingReviewTask:
    | {
        id: string;
        title: string;
        instructions: string;
        actionType: string;
        dueAt: string | null;
      }
    | null;
  matchSignals: string[];
  classificationSignals: string[];
  availableActions: {
    markAcknowledged: boolean;
    markCompleted: boolean;
    markRejected: boolean;
    requestUserAction: boolean;
    dismissNoise: boolean;
  };
}

export interface ResolveReviewItemInput {
  action: ReviewResolutionAction;
  note?: string | null;
}

export async function getReviewQueue(userId: string): Promise<ReviewQueueItem[]> {
  const inboundMessages = await prisma.inboundMessage.findMany({
    where: {
      AND: [
        {
          OR: [
            { matchedDeletionRequest: { userId } },
            { matchedRemovalRequest: { deletionRequest: { userId } } },
            { tasks: { some: { userId } } },
          ],
        },
        {
          OR: [
            { requiresReview: true },
            { tasks: { some: { userId, status: "pending_review" } } },
          ],
        },
      ],
    },
    include: {
      matchedBroker: {
        select: { name: true, domain: true },
      },
      matchedRemovalRequest: {
        select: {
          id: true,
          status: true,
          submittedAt: true,
          deletionRequestId: true,
          broker: {
            select: { name: true, domain: true },
          },
        },
      },
      tasks: {
        where: { userId },
        select: {
          id: true,
          title: true,
          instructions: true,
          actionType: true,
          dueAt: true,
          status: true,
          requiresReview: true,
          removalRequestId: true,
          deletionRequestId: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
  });

  return inboundMessages.map((message) => {
    const pendingReviewTask =
      message.tasks.find((task) => task.status === "pending_review") ?? null;
    const broker = message.matchedBroker ?? message.matchedRemovalRequest?.broker ?? null;

    return {
      id: message.id,
      receivedAt: message.receivedAt.toISOString(),
      fromAddress: message.fromAddress,
      toAddress: message.toAddress,
      subject: message.subject,
      excerpt: buildExcerpt(message.textBody ?? message.htmlBody ?? message.subject ?? ""),
      matchStatus: message.matchStatus as MatchStatus,
      matchConfidence: message.matchConfidence ?? null,
      classification: message.classification as ClassificationLabel | null,
      classificationConfidence: message.classificationConfidence ?? null,
      reviewReason: getReviewReason(message.matchStatus as MatchStatus, message.classification, pendingReviewTask),
      broker,
      request: message.matchedRemovalRequest
        ? {
            id: message.matchedRemovalRequest.id,
            status: message.matchedRemovalRequest.status,
            submittedAt: message.matchedRemovalRequest.submittedAt?.toISOString() ?? null,
          }
        : null,
      pendingReviewTask: pendingReviewTask
        ? {
            id: pendingReviewTask.id,
            title: pendingReviewTask.title,
            instructions: shortenTaskInstructions(pendingReviewTask.instructions),
            actionType: pendingReviewTask.actionType,
            dueAt: pendingReviewTask.dueAt?.toISOString() ?? null,
          }
        : null,
      matchSignals: parseMatchSignals(message.matchSignals),
      classificationSignals: parseClassificationSignals(message.classificationSignals),
      availableActions: getAvailableActions(
        message.matchedRemovalRequest?.status ?? null,
        Boolean(message.matchedRemovalRequestId || message.matchedDeletionRequestId || pendingReviewTask)
      ),
    };
  });
}

export async function resolveReviewItem(
  userId: string,
  inboundMessageId: string,
  input: ResolveReviewItemInput
): Promise<void> {
  const message = await prisma.inboundMessage.findFirst({
    where: {
      id: inboundMessageId,
      OR: [
        { matchedDeletionRequest: { userId } },
        { matchedRemovalRequest: { deletionRequest: { userId } } },
        { tasks: { some: { userId } } },
      ],
    },
    include: {
      matchedBroker: {
        select: { name: true, domain: true },
      },
      matchedRemovalRequest: {
        select: {
          id: true,
          status: true,
          deletionRequestId: true,
          broker: {
            select: { name: true, domain: true },
          },
        },
      },
      tasks: {
        where: { userId },
        select: {
          id: true,
          title: true,
          instructions: true,
          actionType: true,
          dueAt: true,
          status: true,
          requiresReview: true,
          removalRequestId: true,
          deletionRequestId: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!message) {
    throw new Error("Review item not found");
  }

  const note = input.note?.trim() || null;
  const brokerName =
    message.matchedBroker?.name ??
    message.matchedRemovalRequest?.broker.name ??
    extractDomain(message.fromAddress) ??
    "Broker";
  const excerpt = buildExcerpt(message.textBody ?? message.htmlBody ?? message.subject ?? "", 280);
  const pendingReviewTasks = message.tasks.filter((task) => task.status === "pending_review");
  const activeTaskIds = message.tasks
    .filter((task) => !["completed", "dismissed"].includes(task.status))
    .map((task) => task.id);

  switch (input.action) {
    case "dismiss_noise":
      await prisma.$transaction([
        prisma.inboundMessage.update({
          where: { id: message.id },
          data: {
            classification: "noise",
            classificationConfidence: 100,
            requiresReview: false,
          },
        }),
        ...(activeTaskIds.length > 0
          ? [
              prisma.userTask.updateMany({
                where: { id: { in: activeTaskIds } },
                data: { status: "dismissed", requiresReview: false },
              }),
            ]
          : []),
      ]);
      return;

    case "mark_acknowledged":
      await resolveRequestStatus({
        inboundMessageId: message.id,
        removalRequestId: message.matchedRemovalRequest?.id ?? null,
        nextStatus: "acknowledged",
        note,
        activeTaskIds,
      });
      return;

    case "mark_completed":
      await resolveRequestStatus({
        inboundMessageId: message.id,
        removalRequestId: message.matchedRemovalRequest?.id ?? null,
        nextStatus: "completed",
        note,
        activeTaskIds,
      });
      return;

    case "mark_rejected":
      await resolveRequestStatus({
        inboundMessageId: message.id,
        removalRequestId: message.matchedRemovalRequest?.id ?? null,
        nextStatus: "rejected",
        note: note ?? excerpt ?? "Operator marked this broker reply as a rejection.",
        activeTaskIds,
      });
      return;

    case "request_user_action": {
      if (!message.matchedRemovalRequestId && !message.matchedDeletionRequestId && pendingReviewTasks.length === 0) {
        throw new Error("This review item cannot be turned into a user task yet.");
      }

      const updates: Prisma.PrismaPromise<unknown>[] = [
        prisma.inboundMessage.update({
          where: { id: message.id },
          data: {
            classification: "needs_more_info",
            classificationConfidence: 100,
            requiresReview: false,
          },
        }),
      ];

      if (message.matchedRemovalRequest?.id) {
        updates.push(
          prisma.removalRequest.update({
            where: { id: message.matchedRemovalRequest.id },
            data: { status: "requires_user_action" },
          })
        );
      }

      if (pendingReviewTasks.length > 0) {
        await prisma.$transaction([
          ...updates,
          ...pendingReviewTasks.map((task) =>
            prisma.userTask.update({
              where: { id: task.id },
              data: {
                status: "pending",
                requiresReview: false,
                instructions: note
                  ? `${task.instructions}\n\nOperator note: ${note}`
                  : task.instructions,
              },
            })
          ),
        ]);
        return;
      }

      await prisma.$transaction([
        ...updates,
        prisma.userTask.create({
          data: {
            userId,
            brokerId: message.matchedBrokerId,
            deletionRequestId:
              message.matchedDeletionRequestId ??
              message.matchedRemovalRequest?.deletionRequestId ??
              null,
            removalRequestId: message.matchedRemovalRequest?.id ?? null,
            inboundMessageId: message.id,
            actionType: "generic" satisfies TaskActionType,
            title: `${brokerName}: Review latest broker reply`,
            instructions: buildOperatorTaskInstructions(brokerName, excerpt, note),
            dueAt: computeOperatorTaskDueDate(),
            status: "pending",
            requiresReview: false,
          },
        }),
      ]);
      return;
    }
  }
}

async function resolveRequestStatus(input: {
  inboundMessageId: string;
  removalRequestId: string | null;
  nextStatus: "acknowledged" | "completed" | "rejected";
  note: string | null;
  activeTaskIds: string[];
}) {
  if (!input.removalRequestId) {
    throw new Error("This review item is not linked to a specific broker request.");
  }

  const removalRequestData =
    input.nextStatus === "acknowledged"
      ? {
          status: "acknowledged",
          acknowledgedAt: new Date(),
          rejectionReason: null,
        }
      : input.nextStatus === "completed"
        ? {
            status: "completed",
            completedAt: new Date(),
            rejectionReason: null,
          }
        : {
            status: "rejected",
            rejectionReason: input.note,
          };

  await prisma.$transaction([
    prisma.inboundMessage.update({
      where: { id: input.inboundMessageId },
      data: {
        classification:
          input.nextStatus === "acknowledged"
            ? "acknowledgment"
            : input.nextStatus === "completed"
              ? "completion"
              : "rejection",
        classificationConfidence: 100,
        requiresReview: false,
      },
    }),
    prisma.removalRequest.update({
      where: { id: input.removalRequestId },
      data: removalRequestData,
    }),
    ...(input.activeTaskIds.length > 0
      ? [
          prisma.userTask.updateMany({
            where: { id: { in: input.activeTaskIds } },
            data: { status: "dismissed", requiresReview: false },
          }),
        ]
      : []),
  ]);
}

function getReviewReason(
  matchStatus: MatchStatus,
  classification: string | null,
  pendingReviewTask: { id: string } | null
) {
  if (pendingReviewTask) {
    return "A follow-up task was generated, but it is being held for operator review before it reaches the user.";
  }

  if (matchStatus === "ambiguous") {
    return "This reply could not be matched confidently to one specific broker request.";
  }

  if (matchStatus === "broker_only") {
    return "The broker was identified, but the exact request still needs operator confirmation.";
  }

  if (matchStatus === "unmatched") {
    return "This inbound reply did not match a specific request strongly enough to auto-resolve.";
  }

  if (!classification) {
    return "The reply content did not classify cleanly enough to update the request automatically.";
  }

  return "This reply needs operator confirmation before it changes request status or creates a user task.";
}

function getAvailableActions(
  requestStatus: string | null,
  canRequestUserAction: boolean
) {
  const requestIsTerminal = requestStatus === "completed" || requestStatus === "rejected";

  return {
    markAcknowledged: Boolean(requestStatus) && !requestIsTerminal,
    markCompleted: Boolean(requestStatus),
    markRejected: Boolean(requestStatus) && requestStatus !== "completed",
    requestUserAction: canRequestUserAction && !requestIsTerminal,
    dismissNoise: true,
  };
}

function parseMatchSignals(value: string | null): string[] {
  const signals = parseJson<MatchSignal>(value);
  return signals.filter((signal) => signal.hit).map((signal) => signal.detail);
}

function parseClassificationSignals(value: string | null): string[] {
  const signals = parseJson<ClassificationSignal>(value);
  return signals.map((signal) => signal.detail);
}

function parseJson<T>(value: string | null): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function shortenTaskInstructions(value: string, maxLength = 220) {
  const trimmed = value.split("\n\nBroker message excerpt:")[0].trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function buildExcerpt(body: string, maxLength = 220) {
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildOperatorTaskInstructions(
  brokerName: string,
  excerpt: string,
  note: string | null
) {
  const parts = [
    `${brokerName} sent a reply that needs your attention. Review the broker message and complete the next requested step.`,
  ];

  if (note) {
    parts.push(`Operator note: ${note}`);
  }

  if (excerpt) {
    parts.push(`Broker message excerpt: "${excerpt}"`);
  }

  return parts.join("\n\n");
}

function computeOperatorTaskDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  return due;
}

function extractDomain(email: string) {
  return email.split("@")[1] ?? null;
}
