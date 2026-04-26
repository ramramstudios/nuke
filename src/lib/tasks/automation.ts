import { prisma } from "@/lib/db";
import type { FormAutomationBlockerType } from "@/lib/automation/types";

const AUTOMATION_PROVIDER = "automation";
const DEFAULT_TASK_DEADLINE_DAYS = 3;

export async function syncAutomationTaskForBlockedForm(input: {
  removalRequestId: string;
  blockerType: FormAutomationBlockerType | null | undefined;
  reason: string;
  actionUrl: string | null | undefined;
  occurredAt: Date;
}): Promise<void> {
  const request = await prisma.removalRequest.findUnique({
    where: { id: input.removalRequestId },
    include: {
      broker: true,
      deletionRequest: {
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  });

  if (!request) return;

  const content = buildAutomationTaskContent(
    request.broker.name,
    input.blockerType ?? "automation_gap",
    input.reason
  );

  const pendingTasks = await prisma.userTask.findMany({
    where: {
      userId: request.deletionRequest.userId,
      removalRequestId: request.id,
      status: "pending",
    },
    include: {
      inboundMessage: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const existingTask = pendingTasks.find(
    (task) => task.inboundMessage.provider === AUTOMATION_PROVIDER
  );

  const dueAt = computeTaskDueDate(input.occurredAt);
  const subject = `NUKE automation chore: ${content.title}`;
  const textBody = `${content.instructions}\n\nAutomation blocker: ${input.reason}`;
  const rawPayload = JSON.stringify({
    source: "form_automation",
    blockerType: input.blockerType ?? "automation_gap",
    reason: input.reason,
    actionUrl: input.actionUrl ?? null,
    removalRequestId: request.id,
    brokerName: request.broker.name,
  });

  if (existingTask) {
    await prisma.$transaction([
      prisma.inboundMessage.update({
        where: { id: existingTask.inboundMessageId },
        data: {
          subject,
          textBody,
          receivedAt: input.occurredAt,
          classification: "needs_more_info",
          classificationConfidence: 100,
          classificationSignals: JSON.stringify([
            {
              detail: input.reason,
              label: "needs_more_info",
              rule: `automation_blocker_${input.blockerType ?? "automation_gap"}`,
              weight: 100,
            },
          ]),
          requiresReview: false,
          rawPayload,
        },
      }),
      prisma.userTask.update({
        where: { id: existingTask.id },
        data: {
          actionType: content.actionType,
          title: content.title,
          instructions: content.instructions,
          actionUrl: input.actionUrl ?? null,
          dueAt,
          requiresReview: false,
          status: "pending",
        },
      }),
    ]);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const inboundMessage = await tx.inboundMessage.create({
      data: {
        provider: AUTOMATION_PROVIDER,
        providerMessageId: null,
        providerThreadId: null,
        fromAddress: `automation@${request.broker.domain}`,
        toAddress: request.deletionRequest.user.email,
        subject,
        textBody,
        htmlBody: null,
        headers: JSON.stringify({
          "x-nuke-origin": "automation",
        }),
        receivedAt: input.occurredAt,
        rawPayload,
        matchStatus: "matched",
        matchConfidence: 100,
        matchSignals: JSON.stringify([
          {
            detail: "Generated from a broker automation blocker on a matched removal request.",
            hit: true,
            signal: "request_active_status",
          },
        ]),
        matchedRemovalRequestId: request.id,
        matchedDeletionRequestId: request.deletionRequest.id,
        matchedBrokerId: request.brokerId,
        classification: "needs_more_info",
        classificationConfidence: 100,
        classificationSignals: JSON.stringify([
          {
            detail: input.reason,
            label: "needs_more_info",
            rule: `automation_blocker_${input.blockerType ?? "automation_gap"}`,
            weight: 100,
          },
        ]),
        requiresReview: false,
      },
    });

    await tx.userTask.create({
      data: {
        userId: request.deletionRequest.userId,
        brokerId: request.brokerId,
        deletionRequestId: request.deletionRequest.id,
        removalRequestId: request.id,
        inboundMessageId: inboundMessage.id,
        actionType: content.actionType,
        title: content.title,
        instructions: content.instructions,
        actionUrl: input.actionUrl ?? null,
        dueAt,
        status: "pending",
        requiresReview: false,
      },
    });
  });
}

export async function dismissAutomationTasksForRemovalRequest(
  removalRequestId: string
): Promise<void> {
  const tasks = await prisma.userTask.findMany({
    where: {
      removalRequestId,
      status: "pending",
    },
    include: {
      inboundMessage: true,
    },
  });

  const automationTaskIds = tasks
    .filter((task) => task.inboundMessage.provider === AUTOMATION_PROVIDER)
    .map((task) => task.id);

  if (automationTaskIds.length === 0) return;

  await prisma.userTask.updateMany({
    where: {
      id: { in: automationTaskIds },
    },
    data: {
      status: "dismissed",
      requiresReview: false,
    },
  });
}

function buildAutomationTaskContent(
  brokerName: string,
  blockerType: FormAutomationBlockerType,
  reason: string
): {
  actionType: string;
  instructions: string;
  title: string;
} {
  switch (blockerType) {
    case "captcha":
      if (/verification form/i.test(reason)) {
        return {
          actionType: "complete_broker_form",
          title: `${brokerName}: Complete verification form`,
          instructions: [
            `NUKE filled ${brokerName}'s initial verification form as far as it safely could.`,
            "Open the broker page and complete the CAPTCHA.",
            "Submit the verification form so the broker can email you the next removal step.",
            "Watch your inbox for the broker's follow-up email and finish that step if it arrives.",
          ].join("\n"),
        };
      }

      return {
        actionType: "complete_broker_form",
        title: `${brokerName}: Complete CAPTCHA and submit`,
        instructions: [
          `NUKE reached ${brokerName}'s matched opt-out flow and prefilled the broker page.`,
          "Open the broker page using the task link.",
          "Solve the CAPTCHA and submit the form.",
          "If the broker emails a confirmation link afterward, complete that step too.",
        ].join("\n"),
      };

    case "ambiguous_match":
      return {
        actionType: "review_broker_match",
        title: `${brokerName}: Pick the correct listing`,
        instructions: [
          `NUKE searched ${brokerName} but could not safely choose between multiple likely listings.`,
          "Open the broker search results using the task link.",
          "Select the correct record manually and continue the broker's opt-out flow.",
          "Only complete the opt-out if the record clearly matches your information.",
        ].join("\n"),
      };

    case "bot_check":
      return {
        actionType: "complete_broker_form",
        title: `${brokerName}: Retry broker challenge`,
        instructions: [
          `${brokerName} presented a live bot-check or rate-limit screen to the automation.`,
          "Open the broker page using the task link.",
          "Retry the page manually and complete any challenge or verification it shows.",
          "Continue the broker's opt-out flow once the page loads normally.",
        ].join("\n"),
      };

    case "rate_limit":
      return {
        actionType: "retry_later",
        title: `${brokerName}: Retry after rate limit`,
        instructions: [
          `${brokerName} rate-limited or temporarily blocked the automation attempt.`,
          "Open the broker page using the task link after waiting a little while.",
          "Continue the opt-out manually if the page loads normally.",
          "If the broker still shows a rate-limit screen, leave this task open for a later retry.",
        ].join("\n"),
      };

    case "confirmation_required":
      return {
        actionType: "click_confirm",
        title: `${brokerName}: Confirm email request`,
        instructions: [
          `${brokerName} requires an email confirmation before the removal can continue.`,
          "Check the inbox for the email address used in your NUKE profile.",
          "Open the broker's confirmation or verification link.",
          "Return to the dashboard after completing the email step.",
        ].join("\n"),
      };

    case "identity_verification":
      return {
        actionType: "verify_identity",
        title: `${brokerName}: Verify identity`,
        instructions: [
          `${brokerName} requires identity verification before this removal can continue.`,
          "Open the broker page using the task link.",
          "Provide only the information the broker requires for the privacy request.",
          "Do not upload sensitive documents unless you are comfortable with the broker's instructions.",
        ].join("\n"),
      };

    case "document_upload":
      return {
        actionType: "verify_identity",
        title: `${brokerName}: Review document request`,
        instructions: [
          `${brokerName} is asking for a document upload before it will continue the removal request.`,
          "Open the broker page using the task link and review exactly what document is requested.",
          "Complete the step only if the request looks legitimate and necessary.",
          "Consider routing this to managed-service review if you are unsure.",
        ].join("\n"),
      };

    case "record_selection_required":
      return {
        actionType: "review_broker_match",
        title: `${brokerName}: Select the matching record`,
        instructions: [
          `NUKE reached ${brokerName}'s search or opt-out flow, but the broker still needs a person to choose the exact matching record.`,
          "Open the broker page using the task link.",
          "Search with your current name and location if the fields are not already filled.",
          "Only continue the opt-out if the listing clearly matches your information.",
        ].join("\n"),
      };

    case "profile_url_required":
      return {
        actionType: "review_broker_match",
        title: `${brokerName}: Find the profile URL`,
        instructions: [
          `${brokerName} requires the exact profile URL before it accepts an opt-out request.`,
          "Open the broker search page using the task link.",
          "Select the listing that clearly matches your information.",
          "Copy that profile URL into the broker's removal form and continue any email-confirmation step.",
        ].join("\n"),
      };

    case "unclear_submission":
      return {
        actionType: "verify_submission",
        title: `${brokerName}: Verify broker response`,
        instructions: [
          `NUKE filled ${brokerName}'s form but could not confirm whether the broker accepted it.`,
          "Open the broker page again using the task link.",
          "Check whether the form still needs submission or whether a success message is visible.",
          "Complete the submission manually if needed.",
        ].join("\n"),
      };

    case "automation_runtime_failure":
      return {
        actionType: "operator_review",
        title: `${brokerName}: Automation needs review`,
        instructions: [
          `${brokerName} automation stopped before NUKE could reach a trustworthy broker state.`,
          "Open the broker link from this task to continue manually.",
          "If you are an operator, review the automation artifacts and retry the run after confirming browser access.",
          "Leave this task open if the broker page still cannot be reached.",
        ].join("\n"),
      };

    case "automation_gap":
      return {
        actionType: "complete_broker_form",
        title: `${brokerName}: Continue manually`,
        instructions: [
          `${brokerName} does not yet have a complete broker-specific automation path for this step.`,
          "Open the broker link from this task.",
          "Complete the visible opt-out or privacy request flow manually.",
          "Return to the dashboard afterward so NUKE can keep tracking follow-up state.",
        ].join("\n"),
      };

    default:
      return {
        actionType: "generic",
        title: `${brokerName}: Finish broker step`,
        instructions: [
          `${brokerName} needs a manual follow-up step before the removal can continue.`,
          "Open the broker link from this task.",
          "Complete the next visible broker step.",
          "Return to the dashboard afterward to track the request.",
        ].join("\n"),
      };
  }
}

function computeTaskDueDate(from: Date): Date {
  return new Date(
    from.getTime() + DEFAULT_TASK_DEADLINE_DAYS * 24 * 60 * 60 * 1000
  );
}
