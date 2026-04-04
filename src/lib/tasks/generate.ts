import { prisma } from "@/lib/db";
import type {
  MatchResult,
  ClassificationResult,
  ClassificationSignal,
} from "@/lib/communications/types";

/**
 * Action types that map to classifier signals.
 * Each determines the kind of user-facing instruction generated.
 */
export type TaskActionType =
  | "verify_identity"
  | "provide_info"
  | "click_confirm"
  | "reply_to_broker"
  | "generic";

export interface TaskGenerationResult {
  created: boolean;
  taskId: string | null;
  reason: string;
}

/**
 * Default deadline offset when the broker message doesn't specify one.
 * 10 calendar days is generous enough for most broker verification flows.
 */
const DEFAULT_DEADLINE_DAYS = 10;

/**
 * Minimum classification confidence to auto-generate a user-facing task.
 * Below this, the inbound message stays for operator review only.
 */
const MIN_CONFIDENCE = 40;

/**
 * Attempt to generate a user-facing action task from a classified inbound message.
 *
 * Only creates a task when:
 *   1. classification == needs_more_info
 *   2. matchStatus == matched (we know the user and request)
 *   3. confidence >= MIN_CONFIDENCE
 *   4. no duplicate task exists for this inboundMessageId
 *
 * For broker_only / ambiguous / unmatched needs_more_info messages, creates
 * a pending_review task if a deletion request can be inferred, otherwise skips.
 */
export async function maybeGenerateTask(
  inboundMessageId: string,
  match: MatchResult,
  classification: ClassificationResult
): Promise<TaskGenerationResult> {
  if (classification.label !== "needs_more_info") {
    return { created: false, taskId: null, reason: "classification is not needs_more_info" };
  }

  if (classification.confidence < MIN_CONFIDENCE) {
    return { created: false, taskId: null, reason: "confidence too low" };
  }

  // Prevent duplicate tasks for the same inbound message
  const existing = await prisma.userTask.findFirst({
    where: { inboundMessageId },
  });
  if (existing) {
    return { created: false, taskId: existing.id, reason: "task already exists" };
  }

  // Resolve the user from the matched request chain
  const userId = await resolveUserId(match);
  if (!userId) {
    return { created: false, taskId: null, reason: "cannot resolve userId from match" };
  }

  // A task is fully actionable only when:
  //   - match resolved to a specific removal request
  //   - match status is "matched" (not broker_only/ambiguous/unmatched)
  //   - classifier does not flag the message for review (confidence >= 60 + matched)
  const isActionable =
    match.status === "matched" &&
    !!match.removalRequestId &&
    !classification.requiresReview;

  const actionType = deriveActionType(classification.signals);
  const brokerName = await resolveBrokerName(match.brokerId);

  // Fetch the inbound message for instruction generation
  const inbound = await prisma.inboundMessage.findUnique({
    where: { id: inboundMessageId },
    select: { subject: true, textBody: true, htmlBody: true },
  });

  const title = generateTitle(actionType, brokerName);
  const instructions = generateInstructions(
    actionType,
    brokerName,
    classification.signals,
    inbound?.textBody ?? inbound?.subject ?? null
  );
  const actionUrl = extractActionUrl(inbound?.textBody, inbound?.htmlBody);
  const dueAt = computeDueDate(inbound?.textBody ?? null);

  const task = await prisma.userTask.create({
    data: {
      userId,
      brokerId: match.brokerId,
      deletionRequestId: match.deletionRequestId,
      removalRequestId: match.removalRequestId,
      inboundMessageId,
      actionType,
      title,
      instructions,
      actionUrl,
      dueAt,
      status: isActionable ? "pending" : "pending_review",
      requiresReview: !isActionable,
    },
  });

  // Only advance the removal request when the task is fully actionable
  if (isActionable && match.removalRequestId) {
    await prisma.removalRequest.update({
      where: { id: match.removalRequestId },
      data: { status: "requires_user_action" },
    });
  }

  return { created: true, taskId: task.id, reason: "task created" };
}

/**
 * Determine the most specific action type from classification signals.
 */
function deriveActionType(signals: ClassificationSignal[]): TaskActionType {
  const firedRules = new Set(signals.map((s) => s.rule));

  if (firedRules.has("nmi_verify_identity")) return "verify_identity";
  if (firedRules.has("nmi_click_confirm")) return "click_confirm";
  if (firedRules.has("nmi_additional_info")) return "provide_info";
  if (firedRules.has("nmi_respond_to")) return "reply_to_broker";
  return "generic";
}

function generateTitle(actionType: TaskActionType, broker: string): string {
  switch (actionType) {
    case "verify_identity":
      return `${broker}: Verify your identity`;
    case "click_confirm":
      return `${broker}: Confirm your request`;
    case "provide_info":
      return `${broker}: Provide additional information`;
    case "reply_to_broker":
      return `${broker}: Reply to broker`;
    case "generic":
      return `${broker}: Action required`;
  }
}

function generateInstructions(
  actionType: TaskActionType,
  broker: string,
  signals: ClassificationSignal[],
  messageExcerpt: string | null
): string {
  const base = actionTypeInstruction(actionType, broker);
  const context = signals
    .filter((s) => s.label === "needs_more_info")
    .map((s) => s.detail)
    .join("; ");

  let result = base;
  if (context) {
    result += `\n\nDetected signals: ${context}`;
  }
  if (messageExcerpt) {
    const trimmed = messageExcerpt.slice(0, 300).trim();
    if (trimmed) {
      result += `\n\nBroker message excerpt: "${trimmed}${messageExcerpt.length > 300 ? "..." : ""}"`;
    }
  }
  return result;
}

function actionTypeInstruction(actionType: TaskActionType, broker: string): string {
  switch (actionType) {
    case "verify_identity":
      return `${broker} requires identity verification to process your removal request. Reply to the broker with the requested identification or proof of identity.`;
    case "click_confirm":
      return `${broker} sent a confirmation link. Click the link in the broker's email to confirm your removal request.`;
    case "provide_info":
      return `${broker} needs additional information to process your removal request. Review their message and provide the requested details.`;
    case "reply_to_broker":
      return `${broker} is waiting for your response. Reply to their message to continue processing your removal request.`;
    case "generic":
      return `${broker} requires action from you to continue processing your removal request. Review the broker's message for details.`;
  }
}

/**
 * Try to extract a URL from the message body that the user should act on.
 * Looks for http/https links, preferring those near confirm/verify keywords.
 */
function extractActionUrl(
  textBody: string | null | undefined,
  htmlBody: string | null | undefined
): string | null {
  const text = textBody ?? htmlBody ?? "";
  if (!text) return null;

  // Extract all URLs
  const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;
  const urls = text.match(urlPattern);
  if (!urls || urls.length === 0) return null;

  // Prefer URLs near action-related keywords
  const actionKeywords = /confirm|verify|opt.?out|unsubscribe|click|action|complete/i;
  for (const url of urls) {
    const idx = text.indexOf(url);
    const surrounding = text.slice(Math.max(0, idx - 100), idx + url.length + 100);
    if (actionKeywords.test(surrounding)) {
      return url;
    }
  }

  // If only one URL, return it; otherwise don't guess
  return urls.length === 1 ? urls[0] : null;
}

/**
 * Parse a deadline from the broker message if one is mentioned,
 * otherwise fall back to DEFAULT_DEADLINE_DAYS from now.
 */
function computeDueDate(textBody: string | null): Date {
  if (textBody) {
    const match = textBody.match(
      /(?:within|in)\s+(\d+)\s*(calendar\s+)?day/i
    );
    if (match) {
      const days = parseInt(match[1], 10);
      if (days > 0 && days <= 90) {
        const due = new Date();
        due.setDate(due.getDate() + days);
        return due;
      }
    }
  }

  const due = new Date();
  due.setDate(due.getDate() + DEFAULT_DEADLINE_DAYS);
  return due;
}

async function resolveUserId(match: MatchResult): Promise<string | null> {
  if (match.deletionRequestId) {
    const dr = await prisma.deletionRequest.findUnique({
      where: { id: match.deletionRequestId },
      select: { userId: true },
    });
    if (dr) return dr.userId;
  }

  if (match.removalRequestId) {
    const rr = await prisma.removalRequest.findUnique({
      where: { id: match.removalRequestId },
      include: { deletionRequest: { select: { userId: true } } },
    });
    if (rr) return rr.deletionRequest.userId;
  }

  // Fallback for broker_only matches: find the most recent user who has
  // an active removal request for this broker. Only resolves when exactly
  // one user matches, to avoid assigning a task to the wrong person.
  if (match.brokerId) {
    const candidates = await prisma.removalRequest.findMany({
      where: {
        brokerId: match.brokerId,
        status: { in: ["pending", "submitted", "acknowledged", "requires_user_action"] },
      },
      select: { deletionRequest: { select: { userId: true } } },
      distinct: ["deletionRequestId"],
    });
    const uniqueUserIds = [...new Set(candidates.map((c) => c.deletionRequest.userId))];
    if (uniqueUserIds.length === 1) {
      return uniqueUserIds[0];
    }
  }

  return null;
}

async function resolveBrokerName(brokerId: string | null): Promise<string> {
  if (!brokerId) return "Broker";
  const broker = await prisma.broker.findUnique({
    where: { id: brokerId },
    select: { name: true },
  });
  return broker?.name ?? "Broker";
}
