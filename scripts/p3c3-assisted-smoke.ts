import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { processRemoval } from "@/lib/removal/engine";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

async function main() {
  process.env.FORM_AUTOMATION_ENABLED = "true";

  const suffix = randomUUID().slice(0, 8);
  const email = `p3c3-smoke-${suffix}@example.com`;
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
        userId: user.id,
        payloadSnapshot,
        status: "active",
      },
    });

    const brokers = await prisma.broker.findMany({
      where: {
        name: {
          in: ["Spokeo", "Advanced Background Checks"],
        },
      },
      orderBy: { name: "asc" },
    });

    const requests = [];
    for (const broker of brokers) {
      requests.push(
        await prisma.removalRequest.create({
          data: {
            deletionRequestId: deletionRequest.id,
            brokerId: broker.id,
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
          status: request.status,
          removalUrl: request.removalUrl,
          lastError: request.lastError,
          taskCount: request.tasks.length,
          tasks: request.tasks.map((task) => ({
            title: task.title,
            actionType: task.actionType,
            status: task.status,
            actionUrl: task.actionUrl,
            inboundProvider: task.inboundMessage.provider,
            inboundSubject: task.inboundMessage.subject,
          })),
        })),
        null,
        2
      )
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
