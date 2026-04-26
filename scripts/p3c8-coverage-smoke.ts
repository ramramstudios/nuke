import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { getSuccessMetricsReport } from "@/lib/reporting/metrics";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";
import { syncAutomationTaskForBlockedForm } from "@/lib/tasks/automation";

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const [spokeo, epsilon, truePeopleSearch] = await Promise.all([
    prisma.broker.findUnique({ where: { name: "Spokeo" } }),
    prisma.broker.findUnique({ where: { name: "Epsilon" } }),
    prisma.broker.findUnique({ where: { name: "TruePeopleSearch" } }),
  ]);

  if (!spokeo || !epsilon || !truePeopleSearch) {
    throw new Error("P3C8 smoke requires seeded Spokeo, Epsilon, and TruePeopleSearch brokers.");
  }

  const user = await prisma.user.create({
    data: {
      email: `p3c8-smoke-${suffix}@example.com`,
      passwordHash: "smoke-test",
      verified: true,
    },
  });

  try {
    const now = new Date();
    const payloadSnapshot = createRemovalProfileSnapshot({
      fullNames: encryptJSON(["Jordan Coverage"]),
      emails: encryptJSON([`jordan.coverage.${suffix}@example.com`]),
      phones: encryptJSON(["2025550199"]),
      addresses: encryptJSON([
        {
          city: "Chicago",
          state: "IL",
          street: "8 Coverage Way",
          zip: "60601",
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
        brokerId: epsilon.id,
        deadline: new Date(now.getTime() + epsilon.slaInDays * 24 * 60 * 60 * 1000),
        deletionRequestId: deletionRequest.id,
        method: "email",
        sentAt: now,
        status: "submitted",
        submittedAt: now,
      },
    });

    const blockedForm = await prisma.removalRequest.create({
      data: {
        brokerId: spokeo.id,
        deadline: new Date(now.getTime() + spokeo.slaInDays * 24 * 60 * 60 * 1000),
        deletionRequestId: deletionRequest.id,
        method: "form",
        removalUrl: "https://www.spokeo.com/optout?url=example",
        status: "requires_user_action",
        submittedAt: now,
      },
    });

    await prisma.automationJob.create({
      data: {
        attempts: 1,
        completedAt: now,
        lastFinishedAt: now,
        lastStartedAt: now,
        removalRequestId: blockedForm.id,
        status: "succeeded",
      },
    });

    await syncAutomationTaskForBlockedForm({
      actionUrl: "https://www.spokeo.com/optout?url=example",
      blockerType: "captcha",
      occurredAt: now,
      reason: "Spokeo stopped at a CAPTCHA during the coverage smoke.",
      removalRequestId: blockedForm.id,
    });

    await prisma.removalRequest.create({
      data: {
        brokerId: truePeopleSearch.id,
        deadline: new Date(
          now.getTime() + truePeopleSearch.slaInDays * 24 * 60 * 60 * 1000
        ),
        deletionRequestId: deletionRequest.id,
        method: "manual_link",
        removalUrl: truePeopleSearch.removalEndpoint,
        status: "requires_user_action",
        submittedAt: now,
      },
    });

    const report = await getSuccessMetricsReport(user.id);
    const coverage = report.coverage;
    const byName = new Map(coverage.brokers.map((broker) => [broker.brokerName, broker]));
    const spokeoCoverage = byName.get("Spokeo");
    const epsilonCoverage = byName.get("Epsilon");
    const truePeopleCoverage = byName.get("TruePeopleSearch");

    if (epsilonCoverage?.coverageStatus !== "automatic") {
      throw new Error(`Expected Epsilon automatic coverage, got ${epsilonCoverage?.coverageStatus}`);
    }

    if (
      spokeoCoverage?.coverageStatus !== "blocked" ||
      spokeoCoverage.handoffCount !== 1 ||
      spokeoCoverage.topBlockerType !== "captcha"
    ) {
      throw new Error(
        `Expected Spokeo blocked coverage with CAPTCHA handoff, got ${JSON.stringify(
          spokeoCoverage
        )}`
      );
    }

    if (truePeopleCoverage?.coverageStatus !== "manual") {
      throw new Error(
        `Expected TruePeopleSearch manual coverage, got ${truePeopleCoverage?.coverageStatus}`
      );
    }

    if (
      coverage.handoffCount < 1 ||
      coverage.blockedCount < 1 ||
      coverage.automaticCount < 1 ||
      coverage.manualCount < 1 ||
      coverage.mostCommonBlocker?.blockerType !== "captcha"
    ) {
      throw new Error(`Unexpected coverage overview: ${JSON.stringify(coverage)}`);
    }

    console.log(
      JSON.stringify(
        {
          automaticCount: coverage.automaticCount,
          blockedCount: coverage.blockedCount,
          handoffCount: coverage.handoffCount,
          manualCount: coverage.manualCount,
          mostCommonBlocker: coverage.mostCommonBlocker,
          sampledBrokers: {
            Epsilon: epsilonCoverage.coverageStatus,
            Spokeo: {
              handoffRate: spokeoCoverage.handoffRate,
              status: spokeoCoverage.coverageStatus,
              topBlockerType: spokeoCoverage.topBlockerType,
            },
            TruePeopleSearch: truePeopleCoverage.coverageStatus,
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
    error instanceof Error
      ? error.message
      : "Phase 3 Chunk 8 coverage smoke failed";
  console.error("[nuke][p3c8-coverage-smoke]", { error: message });
  process.exit(1);
});
