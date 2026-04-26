import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { processRemoval } from "@/lib/removal/engine";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

interface PreflightResult {
  attemptCount: number;
  broker: string;
  lastError: string | null;
  nextRetryAt: boolean;
  providerMessageId: string | null;
  sentAt: boolean;
  status: string;
  submittedAt: boolean;
  to: string | null;
}

async function main() {
  process.env.EMAIL_DELIVERY_MODE = "dry-run";
  process.env.FORM_AUTOMATION_ENABLED = "false";

  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `email-preflight-${suffix}@example.com`,
      passwordHash: "preflight",
      verified: true,
    },
  });

  try {
    const payloadSnapshot = createRemovalProfileSnapshot({
      fullNames: encryptJSON(["Jane Preflight"]),
      emails: encryptJSON(["jane.preflight@example.com"]),
      phones: encryptJSON(["2025550199"]),
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

    const brokers = await prisma.broker.findMany({
      where: {
        active: true,
        removalEndpoint: { not: null },
        removalMethod: "email",
      },
      orderBy: { name: "asc" },
    });

    if (brokers.length === 0) {
      throw new Error("No active email-method brokers are configured.");
    }

    const requests = [];
    for (const broker of brokers) {
      requests.push(
        await prisma.removalRequest.create({
          data: {
            brokerId: broker.id,
            deletionRequestId: deletionRequest.id,
            method: "email",
            status: "pending",
          },
        })
      );
    }

    for (const request of requests) {
      await processRemoval(request.id);
    }

    const processed = await prisma.removalRequest.findMany({
      where: {
        deletionRequestId: deletionRequest.id,
      },
      include: {
        broker: {
          select: {
            name: true,
            removalEndpoint: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const results: PreflightResult[] = processed.map((request) => ({
      attemptCount: request.attemptCount,
      broker: request.broker.name,
      lastError: request.lastError,
      nextRetryAt: Boolean(request.nextRetryAt),
      providerMessageId: request.providerMessageId,
      sentAt: Boolean(request.sentAt),
      status: request.status,
      submittedAt: Boolean(request.submittedAt),
      to: request.broker.removalEndpoint,
    }));

    console.log(JSON.stringify(results, null, 2));

    const failed = results.filter(
      (result) =>
        result.status !== "submitted" ||
        !result.providerMessageId?.startsWith("dryrun_") ||
        !result.sentAt ||
        !result.submittedAt ||
        result.attemptCount !== 1 ||
        !result.nextRetryAt ||
        result.lastError
    );

    if (failed.length > 0) {
      throw new Error(
        `Email preflight failed for: ${failed
          .map((result) => result.broker)
          .join(", ")}`
      );
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Email preflight failed";
  console.error("[nuke][email-preflight]", { error: message });
  process.exit(1);
});
