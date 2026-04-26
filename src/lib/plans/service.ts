import { prisma } from "@/lib/db";
import {
  SELF_SERVE_PLAN_CATALOG,
  getSelfServePlan,
} from "@/lib/plans/catalog";
import { buildConsumerCoverageReport } from "@/lib/plans/coverage";
import type {
  ConsumerCoverageInput,
  ConsumerCoverageReport,
  SelfServePlanDashboardData,
  SelfServePlanKey,
  SelfServePlanRecommendation,
  SelfServePlanSelectionStatus,
  SelfServePlanSelectionSummary,
} from "@/lib/plans/types";
import { getSuccessMetricsReport } from "@/lib/reporting/metrics";

const ACTIVE_MANAGED_STATUSES = ["awaiting_payment", "queued", "active"];

export interface SelectSelfServePlanInput {
  planKey: SelfServePlanKey;
  acknowledgedChoreScope: boolean;
  acknowledgedManagedHandoff: boolean;
  notes?: string | null;
}

export async function getSelfServePlanDashboardData(
  userId: string
): Promise<SelfServePlanDashboardData> {
  const [report, openChoreTasks, selections, activeManagedCount] =
    await Promise.all([
      getSuccessMetricsReport(userId),
      prisma.userTask.findMany({
        where: {
          userId,
          status: "pending",
          brokerId: { not: null },
        },
        select: { brokerId: true },
      }),
      prisma.selfServePlanSelection.findMany({
        where: { userId },
        orderBy: { selectedAt: "desc" },
      }),
      prisma.managedServiceEnrollment.count({
        where: {
          userId,
          status: { in: ACTIVE_MANAGED_STATUSES },
        },
      }),
    ]);

  const openChoreBrokerIds = new Set(
    openChoreTasks
      .map((task) => task.brokerId)
      .filter((id): id is string => Boolean(id))
  );

  const consumerInputs: ConsumerCoverageInput[] = report.coverage.brokers.map(
    (broker) => ({
      brokerId: broker.brokerId,
      brokerName: broker.brokerName,
      domain: broker.domain,
      category: broker.category,
      priority: broker.priority,
      removalMethod: broker.removalMethod,
      coverageStatus: broker.coverageStatus,
      topBlockerType: broker.topBlockerType,
      totalRequests: broker.totalRequests,
      completedCount: broker.completedCount,
      handoffCount: broker.handoffCount,
      hasFormRunner: broker.hasFormRunner,
    })
  );

  const coverage = buildConsumerCoverageReport(
    consumerInputs,
    openChoreBrokerIds,
    report.generatedAt
  );

  const recommendation = recommendPlanForCoverage(coverage);
  const history = selections.map(mapSelection);
  const activeSelection = history.find((s) => s.status === "active") ?? null;

  return {
    generatedAt: report.generatedAt,
    catalog: SELF_SERVE_PLAN_CATALOG,
    recommendation,
    coverage,
    activeSelection,
    history,
    hasActiveManagedEnrollment: activeManagedCount > 0,
  };
}

export async function selectSelfServePlan(
  userId: string,
  input: SelectSelfServePlanInput
): Promise<SelfServePlanDashboardData> {
  const plan = getSelfServePlan(input.planKey);

  const requiresChoreAck = plan.acknowledgements.some(
    (item) => item.key === "chore_scope"
  );
  if (requiresChoreAck && !input.acknowledgedChoreScope) {
    throw new Error(
      "Please confirm you understand the chore scope for this plan before selecting it."
    );
  }

  const requiresManagedAck = plan.acknowledgements.some(
    (item) => item.key === "managed_handoff"
  );
  if (requiresManagedAck && !input.acknowledgedManagedHandoff) {
    throw new Error(
      "Please confirm you understand the concierge handoff workflow before selecting this plan."
    );
  }

  const dashboard = await getSelfServePlanDashboardData(userId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.selfServePlanSelection.updateMany({
      where: { userId, status: "active" },
      data: { status: "superseded", supersededAt: now },
    });

    await tx.selfServePlanSelection.create({
      data: {
        userId,
        planKey: plan.key,
        status: "active",
        automaticBrokerCount: dashboard.coverage.automaticCount,
        choreBrokerCount: dashboard.coverage.choreCount,
        managedBrokerCount: dashboard.coverage.managedCount,
        totalBrokerCount: dashboard.coverage.totalBrokerCount,
        acknowledgedChoreScope: input.acknowledgedChoreScope,
        acknowledgedManagedHandoff: input.acknowledgedManagedHandoff,
        notes: cleanNullable(input.notes),
        selectedAt: now,
      },
    });
  });

  return getSelfServePlanDashboardData(userId);
}

export async function cancelActiveSelfServePlan(
  userId: string
): Promise<SelfServePlanDashboardData> {
  const now = new Date();
  await prisma.selfServePlanSelection.updateMany({
    where: { userId, status: "active" },
    data: { status: "canceled", canceledAt: now },
  });

  return getSelfServePlanDashboardData(userId);
}

export function recommendPlanForCoverage(
  coverage: ConsumerCoverageReport
): SelfServePlanRecommendation {
  if (coverage.totalBrokerCount === 0) {
    return {
      recommendedPlanKey: "free-self-serve",
      reason:
        "No active brokers tracked yet — the free plan is the natural starting point until your account has covered brokers to manage.",
    };
  }

  if (coverage.managedCount > 0) {
    return {
      recommendedPlanKey: "concierge-managed",
      reason: `Your account has ${coverage.managedCount} broker${
        coverage.managedCount === 1 ? "" : "s"
      } that need managed help right now (${coverage.blockedBrokerNames
        .slice(0, 3)
        .join(", ")}${coverage.blockedBrokerNames.length > 3 ? ", and others" : ""}).`,
    };
  }

  if (coverage.choreCount >= Math.max(3, coverage.automaticCount)) {
    return {
      recommendedPlanKey: "assisted-self-serve",
      reason: `You have ${coverage.choreCount} chore broker${
        coverage.choreCount === 1 ? "" : "s"
      } to keep on top of, so the assisted plan's reminders and stalled-request triage are likely worth it.`,
    };
  }

  return {
    recommendedPlanKey: "free-self-serve",
    reason: `${coverage.automaticCount} of ${coverage.totalBrokerCount} brokers can be submitted automatically and the rest are short chores you can finish yourself.`,
  };
}

function mapSelection(selection: {
  id: string;
  planKey: string;
  status: string;
  automaticBrokerCount: number;
  choreBrokerCount: number;
  managedBrokerCount: number;
  totalBrokerCount: number;
  acknowledgedChoreScope: boolean;
  acknowledgedManagedHandoff: boolean;
  notes: string | null;
  selectedAt: Date;
  supersededAt: Date | null;
  canceledAt: Date | null;
}): SelfServePlanSelectionSummary {
  return {
    id: selection.id,
    planKey: selection.planKey as SelfServePlanKey,
    status: selection.status as SelfServePlanSelectionStatus,
    automaticBrokerCount: selection.automaticBrokerCount,
    choreBrokerCount: selection.choreBrokerCount,
    managedBrokerCount: selection.managedBrokerCount,
    totalBrokerCount: selection.totalBrokerCount,
    acknowledgedChoreScope: selection.acknowledgedChoreScope,
    acknowledgedManagedHandoff: selection.acknowledgedManagedHandoff,
    notes: selection.notes,
    selectedAt: selection.selectedAt.toISOString(),
    supersededAt: selection.supersededAt?.toISOString() ?? null,
    canceledAt: selection.canceledAt?.toISOString() ?? null,
  };
}

function cleanNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
