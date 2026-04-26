import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { processRemoval } from "@/lib/removal/engine";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

const PHASE_3_CHUNK_4_BROKERS = [
  "Spokeo",
  "Advanced Background Checks",
  "FamilyTreeNow",
  "Nuwber",
  "SmartBackgroundChecks",
  "That's Them",
];

async function main() {
  process.env.FORM_AUTOMATION_ENABLED = "true";

  const suffix = randomUUID().slice(0, 8);
  const email = `p3c4-smoke-${suffix}@example.com`;
  const payloadSnapshot = createRemovalProfileSnapshot({
    fullNames: encryptJSON(["John Smith"]),
    emails: encryptJSON(["nuke-test@example.com"]),
    phones: encryptJSON(["2025550101"]),
    addresses: encryptJSON([
      {
        street: "1108 Carissa Dr",
        city: "Tallahassee",
        state: "FL",
        zip: "32308",
      },
    ]),
    advertisingIds: encryptJSON([]),
    vin: null,
  });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "smoke-test",
      verified: true,
    },
  });

  try {
    const deletionRequest = await prisma.deletionRequest.create({
      data: {
        payloadSnapshot,
        status: "active",
        userId: user.id,
      },
    });

    const brokers = await prisma.broker.findMany({
      where: {
        name: {
          in: PHASE_3_CHUNK_4_BROKERS,
        },
      },
      orderBy: { name: "asc" },
    });

    const found = new Set(brokers.map((broker) => broker.name));
    const missing = PHASE_3_CHUNK_4_BROKERS.filter((broker) => !found.has(broker));
    if (missing.length > 0) {
      throw new Error(`Missing Phase 3 Chunk 4 brokers: ${missing.join(", ")}`);
    }

    const requests = [];
    for (const broker of brokers) {
      requests.push(
        await prisma.removalRequest.create({
          data: {
            brokerId: broker.id,
            deletionRequestId: deletionRequest.id,
            method: "form",
            status: "pending",
          },
        })
      );
    }

    for (const request of requests) {
      await processRemoval(request.id);
    }

    const results = await prisma.removalRequest.findMany({
      where: {
        deletionRequestId: deletionRequest.id,
      },
      include: {
        broker: {
          select: { name: true },
        },
        tasks: {
          include: {
            inboundMessage: {
              select: {
                provider: true,
                subject: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(
      JSON.stringify(
        results.map((request) => ({
          broker: request.broker.name,
          lastError: request.lastError,
          removalUrl: request.removalUrl,
          status: request.status,
          taskCount: request.tasks.length,
          tasks: request.tasks.map((task) => ({
            actionType: task.actionType,
            actionUrl: task.actionUrl,
            inboundProvider: task.inboundMessage.provider,
            inboundSubject: task.inboundMessage.subject,
            status: task.status,
            title: task.title,
          })),
        })),
        null,
        2
      )
    );

    const failed = results.filter(
      (request) =>
        !["submitted", "requires_user_action"].includes(request.status) ||
        (request.status === "requires_user_action" && request.tasks.length === 0)
    );

    if (failed.length > 0) {
      throw new Error(
        `Assisted automation smoke failed for: ${failed
          .map((request) => request.broker.name)
          .join(", ")}`
      );
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Phase 3 Chunk 4 smoke test failed";
  console.error("[nuke][p3c4-assisted-smoke]", { error: message });
  process.exit(1);
});
