import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  enqueueAutomationJobsForDeletionRequest,
  runAutomationQueue,
} from "@/lib/automation/queue";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

async function main() {
  process.env.FORM_AUTOMATION_ENABLED = "true";
  process.env.AUTOMATION_QUEUE_CONCURRENCY = "1";
  process.env.AUTOMATION_QUEUE_MAX_JOBS_PER_RUN = "5";
  process.env.AUTOMATION_QUEUE_MAX_ATTEMPTS = "2";
  process.env.AUTOMATION_PER_BROKER_COOLDOWN_MS = "600000";

  const suffix = randomUUID().slice(0, 8);
  const broker = await prisma.broker.findUnique({
    where: { name: "BeenVerified" },
  });

  if (!broker) {
    throw new Error("BeenVerified broker is required for P3C7 smoke.");
  }

  const users: Array<{ id: string }> = [];

  try {
    for (let index = 0; index < 2; index += 1) {
      const user = await prisma.user.create({
        data: {
          email: `p3c7-smoke-${suffix}-${index}@example.com`,
          passwordHash: "smoke-test",
          verified: true,
        },
      });
      users.push(user);

      const payloadSnapshot = createRemovalProfileSnapshot({
        fullNames: encryptJSON([`Jane Queue ${index}`]),
        emails: encryptJSON([`jane.queue.${index}@example.com`]),
        phones: encryptJSON(["2025550123"]),
        addresses: encryptJSON([
          {
            city: "Austin",
            state: "TX",
            street: `${index + 1} Queue St`,
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

      await prisma.removalRequest.create({
        data: {
          brokerId: broker.id,
          deletionRequestId: deletionRequest.id,
          method: "form",
          status: "pending",
        },
      });

      const enqueue = await enqueueAutomationJobsForDeletionRequest(
        deletionRequest.id
      );
      if (enqueue.enqueued !== 1) {
        throw new Error(`Expected one queued automation job, got ${enqueue.enqueued}`);
      }
    }

    const throttledRun = await runAutomationQueue({
      lockId: `p3c7-smoke-throttled-${suffix}`,
      maxJobs: 5,
    });

    if (throttledRun.started !== 1 || throttledRun.completed !== 1) {
      throw new Error(
        `Expected one started/completed job in throttled run, got ${JSON.stringify(
          throttledRun
        )}`
      );
    }

    if (throttledRun.throttled < 1) {
      throw new Error("Expected the second same-broker job to be throttled.");
    }

    process.env.AUTOMATION_PER_BROKER_COOLDOWN_MS = "0";
    const unthrottledRun = await runAutomationQueue({
      lockId: `p3c7-smoke-unthrottled-${suffix}`,
      maxJobs: 5,
    });

    if (unthrottledRun.started !== 1 || unthrottledRun.completed !== 1) {
      throw new Error(
        `Expected remaining job to complete after cooldown disabled, got ${JSON.stringify(
          unthrottledRun
        )}`
      );
    }

    const jobs = await prisma.automationJob.findMany({
      where: {
        removalRequest: {
          deletionRequest: {
            userId: {
              in: users.map((user) => user.id),
            },
          },
        },
      },
      include: {
        removalRequest: {
          include: {
            tasks: {
              include: {
                inboundMessage: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const failed = jobs.filter(
      (job) =>
        job.status !== "succeeded" ||
        job.attempts !== 1 ||
        job.removalRequest.status !== "requires_user_action" ||
        !job.removalRequest.tasks.some(
          (task) => task.inboundMessage.provider === "automation"
        )
    );

    if (failed.length > 0) {
      throw new Error(
        `P3C7 queue jobs did not finish with automation chores: ${failed
          .map((job) => job.id)
          .join(", ")}`
      );
    }

    console.log(
      JSON.stringify(
        {
          jobs: jobs.map((job) => ({
            attempts: job.attempts,
            completedAt: Boolean(job.completedAt),
            requestStatus: job.removalRequest.status,
            status: job.status,
            taskCount: job.removalRequest.tasks.length,
          })),
          throttledRun,
          unthrottledRun,
        },
        null,
        2
      )
    );
  } finally {
    for (const user of users) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Phase 3 Chunk 7 queue smoke failed";
  console.error("[nuke][p3c7-queue-smoke]", { error: message });
  process.exit(1);
});
