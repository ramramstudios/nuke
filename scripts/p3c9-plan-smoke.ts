import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJSON } from "@/lib/crypto/encrypt";
import {
  cancelActiveSelfServePlan,
  getSelfServePlanDashboardData,
  selectSelfServePlan,
} from "@/lib/plans/service";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";
import { syncAutomationTaskForBlockedForm } from "@/lib/tasks/automation";

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const [spokeo, epsilon, beenVerified, truePeopleSearch] = await Promise.all([
    prisma.broker.findUnique({ where: { name: "Spokeo" } }),
    prisma.broker.findUnique({ where: { name: "Epsilon" } }),
    prisma.broker.findUnique({ where: { name: "BeenVerified" } }),
    prisma.broker.findUnique({ where: { name: "TruePeopleSearch" } }),
  ]);

  if (!spokeo || !epsilon || !beenVerified || !truePeopleSearch) {
    throw new Error(
      "P3C9 smoke requires seeded Spokeo, Epsilon, BeenVerified, and TruePeopleSearch brokers."
    );
  }

  const user = await prisma.user.create({
    data: {
      email: `p3c9-smoke-${suffix}@example.com`,
      passwordHash: "smoke-test",
      verified: true,
    },
  });

  try {
    const now = new Date();
    const payloadSnapshot = createRemovalProfileSnapshot({
      fullNames: encryptJSON(["Jordan Plan"]),
      emails: encryptJSON([`jordan.plan.${suffix}@example.com`]),
      phones: encryptJSON(["2025550199"]),
      addresses: encryptJSON([
        {
          city: "Chicago",
          state: "IL",
          street: "9 Plan Way",
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

    // Automatic broker (email method, no blockers)
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

    // Chore broker (form runner, blocked at CAPTCHA, generates a UserTask)
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

    await syncAutomationTaskForBlockedForm({
      actionUrl: "https://www.spokeo.com/optout?url=example",
      blockerType: "captcha",
      occurredAt: now,
      reason: "Spokeo stopped at a CAPTCHA during the plan smoke.",
      removalRequestId: blockedForm.id,
    });

    // Manual broker (manual_link)
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

    // Note: BeenVerified is a structural managed broker. We don't create a
    // request for it — its presence in the active broker registry alone should
    // place it in the managed bucket.
    void beenVerified;

    const dashboard = await getSelfServePlanDashboardData(user.id);
    const coverage = dashboard.coverage;

    const epsilonRow = coverage.brokers.find((b) => b.brokerName === "Epsilon");
    const spokeoRow = coverage.brokers.find((b) => b.brokerName === "Spokeo");
    const truePeopleRow = coverage.brokers.find(
      (b) => b.brokerName === "TruePeopleSearch"
    );
    const beenVerifiedRow = coverage.brokers.find(
      (b) => b.brokerName === "BeenVerified"
    );

    if (epsilonRow?.bucket !== "automatic") {
      throw new Error(
        `Expected Epsilon in automatic bucket, got ${epsilonRow?.bucket}`
      );
    }

    if (spokeoRow?.bucket !== "managed" || spokeoRow.topBlockerType !== "captcha") {
      // Spokeo with an active blocker is operator-status "blocked", which we
      // route to managed in the consumer view.
      throw new Error(
        `Expected Spokeo in managed bucket via blocker, got ${JSON.stringify(spokeoRow)}`
      );
    }

    if (truePeopleRow?.bucket !== "chore") {
      throw new Error(
        `Expected TruePeopleSearch in chore bucket, got ${truePeopleRow?.bucket}`
      );
    }

    if (beenVerifiedRow?.bucket !== "managed") {
      throw new Error(
        `Expected BeenVerified in managed bucket via structural override, got ${beenVerifiedRow?.bucket}`
      );
    }

    if (coverage.outstandingChoreCount < 1) {
      throw new Error(
        `Expected at least one outstanding chore, got ${coverage.outstandingChoreCount}`
      );
    }

    if (dashboard.recommendation.recommendedPlanKey !== "concierge-managed") {
      throw new Error(
        `Expected concierge recommendation when managed brokers present, got ${dashboard.recommendation.recommendedPlanKey}`
      );
    }

    // Selecting the assisted plan without confirming chore scope must fail.
    let acknowledgementErrorRaised = false;
    try {
      await selectSelfServePlan(user.id, {
        planKey: "assisted-self-serve",
        acknowledgedChoreScope: false,
        acknowledgedManagedHandoff: false,
      });
    } catch (error) {
      acknowledgementErrorRaised = error instanceof Error;
    }
    if (!acknowledgementErrorRaised) {
      throw new Error(
        "Expected selectSelfServePlan to reject assisted plan without chore acknowledgement."
      );
    }

    const afterFree = await selectSelfServePlan(user.id, {
      planKey: "free-self-serve",
      acknowledgedChoreScope: true,
      acknowledgedManagedHandoff: false,
    });
    if (afterFree.activeSelection?.planKey !== "free-self-serve") {
      throw new Error(
        `Expected free plan to be active after first selection, got ${afterFree.activeSelection?.planKey}`
      );
    }

    const afterAssisted = await selectSelfServePlan(user.id, {
      planKey: "assisted-self-serve",
      acknowledgedChoreScope: true,
      acknowledgedManagedHandoff: false,
      notes: "Switching after seeing chore load.",
    });
    if (afterAssisted.activeSelection?.planKey !== "assisted-self-serve") {
      throw new Error(
        `Expected assisted plan to be active after switching, got ${afterAssisted.activeSelection?.planKey}`
      );
    }
    if (afterAssisted.history.length !== 2) {
      throw new Error(
        `Expected two plan selections in history, got ${afterAssisted.history.length}`
      );
    }
    const supersededFree = afterAssisted.history.find(
      (entry) => entry.planKey === "free-self-serve"
    );
    if (supersededFree?.status !== "superseded") {
      throw new Error(
        `Expected previous free plan to be superseded, got ${supersededFree?.status}`
      );
    }

    const afterCancel = await cancelActiveSelfServePlan(user.id);
    if (afterCancel.activeSelection !== null) {
      throw new Error(
        `Expected no active plan after cancel, got ${afterCancel.activeSelection?.planKey}`
      );
    }

    console.log(
      JSON.stringify(
        {
          coverage: {
            automaticCount: coverage.automaticCount,
            choreCount: coverage.choreCount,
            managedCount: coverage.managedCount,
            outstandingChoreCount: coverage.outstandingChoreCount,
            blockedBrokerNames: coverage.blockedBrokerNames.slice(0, 4),
          },
          recommendation: dashboard.recommendation,
          sampledBuckets: {
            BeenVerified: beenVerifiedRow.bucket,
            Epsilon: epsilonRow.bucket,
            Spokeo: spokeoRow.bucket,
            TruePeopleSearch: truePeopleRow.bucket,
          },
          historySize: afterAssisted.history.length,
          finalActivePlan: null,
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
      : "Phase 3 Chunk 9 self-serve plan smoke failed";
  console.error("[nuke][p3c9-plan-smoke]", { error: message });
  process.exit(1);
});
