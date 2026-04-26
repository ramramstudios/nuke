import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  classifyAutomationBlockerText,
  classifyAutomationFailure,
} from "@/lib/automation/challenges";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { processRemoval } from "@/lib/removal/engine";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

const CLASSIFIER_CASES = [
  {
    expected: "captcha",
    text: "Please verify you are human and complete the reCAPTCHA.",
  },
  {
    expected: "rate_limit",
    text: "Too many requests. You are temporarily rate limited. Try again later.",
  },
  {
    expected: "confirmation_required",
    text: "Check your email and click the confirmation link to confirm your request.",
  },
  {
    expected: "identity_verification",
    text: "We need to verify your identity. Please provide your date of birth.",
  },
  {
    expected: "document_upload",
    text: "Attach a copy of your identification document to continue.",
  },
  {
    expected: "bot_check",
    text: "Attention required. Cloudflare is checking your browser before accessing this site.",
  },
];

async function main() {
  process.env.FORM_AUTOMATION_ENABLED = "true";

  for (const testCase of CLASSIFIER_CASES) {
    const detection = classifyAutomationBlockerText(testCase.text, "SmokeBroker");
    if (detection?.blockerType !== testCase.expected) {
      throw new Error(
        `Expected ${testCase.expected}, got ${detection?.blockerType ?? "none"}`
      );
    }
  }

  const runtimeDetection = classifyAutomationFailure(
    "browserType.launch: Target page, context or browser has been closed",
    "SmokeBroker"
  );
  if (runtimeDetection.blockerType !== "automation_runtime_failure") {
    throw new Error(
      `Expected automation_runtime_failure, got ${runtimeDetection.blockerType}`
    );
  }

  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `p3c5-smoke-${suffix}@example.com`,
      passwordHash: "smoke-test",
      verified: true,
    },
  });

  try {
    const payloadSnapshot = createRemovalProfileSnapshot({
      fullNames: encryptJSON(["Jane Challenge"]),
      emails: encryptJSON(["jane.challenge@example.com"]),
      phones: encryptJSON(["2025550123"]),
      addresses: encryptJSON([
        {
          city: "Austin",
          state: "TX",
          street: "1 Test St",
          zip: "78701",
        },
      ]),
      advertisingIds: encryptJSON([]),
      vin: null,
    });

    const deletionRequest = await prisma.deletionRequest.create({
      data: {
        payloadSnapshot,
        status: "active",
        userId: user.id,
      },
    });

    const broker = await prisma.broker.findFirst({
      where: {
        active: true,
        name: "BeenVerified",
        removalMethod: "form",
      },
    });

    if (!broker) {
      throw new Error("BeenVerified form broker was not available for P3C5 smoke.");
    }

    const removalRequest = await prisma.removalRequest.create({
      data: {
        brokerId: broker.id,
        deletionRequestId: deletionRequest.id,
        method: "form",
        status: "pending",
      },
    });

    await processRemoval(removalRequest.id);

    const processed = await prisma.removalRequest.findUnique({
      where: {
        id: removalRequest.id,
      },
      include: {
        tasks: {
          include: {
            inboundMessage: true,
          },
        },
      },
    });

    if (!processed) {
      throw new Error("P3C5 smoke request disappeared before verification.");
    }

    const automationTask = processed.tasks.find(
      (task) => task.inboundMessage.provider === "automation"
    );

    if (processed.status !== "requires_user_action") {
      throw new Error(`Expected requires_user_action, got ${processed.status}`);
    }

    if (processed.method !== "form") {
      throw new Error(`Expected form method to be preserved, got ${processed.method}`);
    }

    if (!automationTask) {
      throw new Error("Expected a generated automation task for blocked form flow.");
    }

    const rawPayload = JSON.parse(automationTask.inboundMessage.rawPayload) as {
      blockerType?: string;
    };

    if (rawPayload.blockerType !== "automation_gap") {
      throw new Error(`Expected automation_gap task, got ${rawPayload.blockerType}`);
    }

    console.log(
      JSON.stringify(
        {
          classifierCases: CLASSIFIER_CASES.length + 1,
          request: {
            actionType: automationTask.actionType,
            blockerType: rawPayload.blockerType,
            method: processed.method,
            removalUrl: processed.removalUrl,
            status: processed.status,
            taskTitle: automationTask.title,
          },
        },
        null,
        2
      )
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Phase 3 Chunk 5 smoke test failed";
  console.error("[nuke][p3c5-challenge-smoke]", { error: message });
  process.exit(1);
});
