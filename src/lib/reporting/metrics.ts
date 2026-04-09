import type { ClassificationLabel } from "@/lib/communications/types";
import { prisma } from "@/lib/db";
import type {
  BrokerSuccessMetric,
  CohortSuccessMetric,
  MetricsOverview,
  ReportTone,
  StalledRequestReport,
  SuccessMetricsReport,
} from "@/lib/reporting/types";

const DAY_MS = 1000 * 60 * 60 * 24;
const HOUR_MS = 1000 * 60 * 60;
const SLA_WARNING_WINDOW_DAYS = 7;
const USER_TASK_WARNING_WINDOW_DAYS = 3;
const NO_REPLY_WARNING_DAYS = 7;
const NO_REPLY_DANGER_DAYS = 14;
const INACTIVITY_WARNING_DAYS = 10;
const INACTIVITY_DANGER_DAYS = 21;

type RequestRecord = Awaited<
  ReturnType<typeof getMetricsRequests>
>[number];

interface AnalyzedRequest {
  requestId: string;
  brokerId: string;
  brokerName: string;
  brokerDomain: string;
  brokerCategory: string;
  brokerPriority: string;
  status: string;
  submittedAt: Date;
  deadline: Date | null;
  lastActivityAt: Date;
  daysOpen: number;
  daysRemaining: number | null;
  replyCount: number;
  hasReply: boolean;
  acknowledged: boolean;
  completed: boolean;
  rejected: boolean;
  open: boolean;
  overdue: boolean;
  requiresUserAction: boolean;
  pendingReview: boolean;
  firstReplyHours: number | null;
  pendingTaskTitle: string | null;
  stallReason: string | null;
  stallTone: ReportTone | null;
  cohortKey: string;
  cohortLabel: string;
}

export async function getSuccessMetricsReport(
  userId: string
): Promise<SuccessMetricsReport> {
  const now = new Date();
  const requests = await getMetricsRequests(userId);
  const analyzed = requests.map((request) => analyzeRequest(request, now));

  return {
    generatedAt: now.toISOString(),
    overview: summarizeOverview(analyzed),
    brokers: summarizeByBroker(analyzed),
    cohorts: summarizeByCohort(analyzed),
    stalledRequests: buildStalledRequests(analyzed),
  };
}

async function getMetricsRequests(userId: string) {
  return prisma.removalRequest.findMany({
    where: {
      deletionRequest: { userId },
      OR: [
        { submittedAt: { not: null } },
        { sentAt: { not: null } },
        { status: { not: "pending" } },
      ],
    },
    include: {
      broker: {
        select: {
          id: true,
          name: true,
          domain: true,
          category: true,
          priority: true,
        },
      },
      inboundMessages: {
        select: {
          id: true,
          receivedAt: true,
          provider: true,
          classification: true,
          requiresReview: true,
        },
      },
      retryAttempts: {
        select: {
          attemptedAt: true,
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          requiresReview: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });
}

function analyzeRequest(request: RequestRecord, now: Date): AnalyzedRequest {
  const submittedAt = request.submittedAt ?? request.sentAt ?? request.createdAt;
  const meaningfulReplies = request.inboundMessages
    .filter(
      (message) =>
        message.provider !== "automation" && message.classification !== "noise"
    )
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  const firstReplyAt = meaningfulReplies[0]?.receivedAt ?? null;
  const replyCount = meaningfulReplies.length;

  const acknowledged =
    Boolean(request.acknowledgedAt) ||
    request.status === "acknowledged" ||
    request.status === "completed" ||
    meaningfulReplies.some((message) =>
      isAcknowledgmentLike(message.classification)
    );
  const completed =
    Boolean(request.completedAt) ||
    request.status === "completed" ||
    meaningfulReplies.some((message) => message.classification === "completion");
  const rejected =
    request.status === "rejected" ||
    meaningfulReplies.some((message) => message.classification === "rejection");
  const open = !completed && !rejected;
  const activeTasks = request.tasks.filter(
    (task) => !["completed", "dismissed"].includes(task.status)
  );
  const pendingTask = [...activeTasks].sort((left, right) => {
    const leftTime = left.dueAt?.getTime() ?? left.createdAt.getTime();
    const rightTime = right.dueAt?.getTime() ?? right.createdAt.getTime();
    return leftTime - rightTime;
  })[0];
  const pendingReview =
    request.inboundMessages.some(
      (message) => message.provider !== "automation" && message.requiresReview
    ) ||
    activeTasks.some((task) => task.requiresReview || task.status === "pending_review");
  const requiresUserAction =
    request.status === "requires_user_action" ||
    activeTasks.some((task) => task.status === "pending");
  const deadline = request.deadline;
  const overdue =
    deadline !== null && deadline.getTime() < now.getTime() && open;
  const daysOpen = roundToOne((now.getTime() - submittedAt.getTime()) / DAY_MS);
  const daysRemaining = deadline
    ? Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS)
    : null;
  const firstReplyHours =
    firstReplyAt !== null
      ? roundToOne((firstReplyAt.getTime() - submittedAt.getTime()) / HOUR_MS)
      : null;
  const lastActivityAt = latestDate([
    submittedAt,
    request.sentAt,
    request.acknowledgedAt,
    request.completedAt,
    request.lastAttemptAt,
    request.escalatedAt,
    request.updatedAt,
    ...meaningfulReplies.map((message) => message.receivedAt),
    ...request.retryAttempts.map((attempt) => attempt.attemptedAt),
    ...request.tasks.flatMap((task) => [task.createdAt, task.updatedAt]),
  ]);
  const stall = getStallDescriptor({
    open,
    overdue,
    daysOpen,
    daysRemaining,
    hasReply: meaningfulReplies.length > 0,
    lastActivityAt,
    now,
    pendingReview,
    requiresUserAction,
    pendingTaskDueAt: pendingTask?.dueAt ?? null,
  });
  const cohort = buildCohort(submittedAt);

  return {
    requestId: request.id,
    brokerId: request.broker.id,
    brokerName: request.broker.name,
    brokerDomain: request.broker.domain,
    brokerCategory: request.broker.category,
    brokerPriority: request.broker.priority,
    status: request.status,
    submittedAt,
    deadline,
    lastActivityAt,
    daysOpen,
    daysRemaining,
    replyCount,
    hasReply: meaningfulReplies.length > 0,
    acknowledged,
    completed,
    rejected,
    open,
    overdue,
    requiresUserAction,
    pendingReview,
    firstReplyHours,
    pendingTaskTitle: pendingTask?.title ?? null,
    stallReason: stall?.reason ?? null,
    stallTone: stall?.tone ?? null,
    cohortKey: cohort.key,
    cohortLabel: cohort.label,
  };
}

function summarizeOverview(requests: AnalyzedRequest[]): MetricsOverview {
  return {
    totalRequests: requests.length,
    repliedCount: requests.filter((request) => request.hasReply).length,
    replyRate: toPercent(
      requests.filter((request) => request.hasReply).length,
      requests.length
    ),
    acknowledgedCount: requests.filter((request) => request.acknowledged).length,
    acknowledgmentRate: toPercent(
      requests.filter((request) => request.acknowledged).length,
      requests.length
    ),
    completedCount: requests.filter((request) => request.completed).length,
    completionRate: toPercent(
      requests.filter((request) => request.completed).length,
      requests.length
    ),
    openCount: requests.filter((request) => request.open).length,
    overdueCount: requests.filter((request) => request.overdue).length,
    stalledCount: requests.filter((request) => request.stallReason !== null).length,
    requiresUserActionCount: requests.filter(
      (request) => request.requiresUserAction
    ).length,
    pendingReviewCount: requests.filter((request) => request.pendingReview).length,
    averageFirstReplyHours: average(
      requests
        .map((request) => request.firstReplyHours)
        .filter((value): value is number => value !== null)
    ),
    averageOpenAgeDays: average(
      requests
        .filter((request) => request.open)
        .map((request) => request.daysOpen)
    ),
  };
}

function summarizeByBroker(requests: AnalyzedRequest[]): BrokerSuccessMetric[] {
  const groups = new Map<string, AnalyzedRequest[]>();

  for (const request of requests) {
    const existing = groups.get(request.brokerId) ?? [];
    existing.push(request);
    groups.set(request.brokerId, existing);
  }

  return [...groups.entries()]
    .map(([brokerId, group]) => {
      const sample = group[0];
      return {
        brokerId,
        brokerName: sample.brokerName,
        domain: sample.brokerDomain,
        category: sample.brokerCategory,
        priority: sample.brokerPriority,
        totalRequests: group.length,
        repliedCount: group.filter((request) => request.hasReply).length,
        replyRate: toPercent(
          group.filter((request) => request.hasReply).length,
          group.length
        ),
        acknowledgedCount: group.filter((request) => request.acknowledged).length,
        acknowledgmentRate: toPercent(
          group.filter((request) => request.acknowledged).length,
          group.length
        ),
        completedCount: group.filter((request) => request.completed).length,
        completionRate: toPercent(
          group.filter((request) => request.completed).length,
          group.length
        ),
        openCount: group.filter((request) => request.open).length,
        overdueCount: group.filter((request) => request.overdue).length,
        stalledCount: group.filter((request) => request.stallReason !== null).length,
        requiresUserActionCount: group.filter(
          (request) => request.requiresUserAction
        ).length,
        pendingReviewCount: group.filter((request) => request.pendingReview).length,
        averageFirstReplyHours: average(
          group
            .map((request) => request.firstReplyHours)
            .filter((value): value is number => value !== null)
        ),
        averageOpenAgeDays: average(
          group.filter((request) => request.open).map((request) => request.daysOpen)
        ),
      };
    })
    .sort((left, right) => {
      return (
        right.stalledCount - left.stalledCount ||
        right.overdueCount - left.overdueCount ||
        right.totalRequests - left.totalRequests ||
        left.brokerName.localeCompare(right.brokerName)
      );
    });
}

function summarizeByCohort(requests: AnalyzedRequest[]): CohortSuccessMetric[] {
  const groups = new Map<string, AnalyzedRequest[]>();

  for (const request of requests) {
    const existing = groups.get(request.cohortKey) ?? [];
    existing.push(request);
    groups.set(request.cohortKey, existing);
  }

  return [...groups.entries()]
    .map(([cohortKey, group]) => {
      const sample = group[0];
      return {
        cohortKey,
        cohortLabel: sample.cohortLabel,
        totalRequests: group.length,
        repliedCount: group.filter((request) => request.hasReply).length,
        replyRate: toPercent(
          group.filter((request) => request.hasReply).length,
          group.length
        ),
        acknowledgedCount: group.filter((request) => request.acknowledged).length,
        acknowledgmentRate: toPercent(
          group.filter((request) => request.acknowledged).length,
          group.length
        ),
        completedCount: group.filter((request) => request.completed).length,
        completionRate: toPercent(
          group.filter((request) => request.completed).length,
          group.length
        ),
        openCount: group.filter((request) => request.open).length,
        overdueCount: group.filter((request) => request.overdue).length,
        stalledCount: group.filter((request) => request.stallReason !== null).length,
        averageFirstReplyHours: average(
          group
            .map((request) => request.firstReplyHours)
            .filter((value): value is number => value !== null)
        ),
        averageOpenAgeDays: average(
          group.filter((request) => request.open).map((request) => request.daysOpen)
        ),
      };
    })
    .sort((left, right) => right.cohortKey.localeCompare(left.cohortKey));
}

function buildStalledRequests(requests: AnalyzedRequest[]): StalledRequestReport[] {
  return requests
    .filter((request) => request.stallReason && request.stallTone)
    .sort((left, right) => {
      return (
        severityRank(left.stallTone) - severityRank(right.stallTone) ||
        (left.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
          (right.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
        right.daysOpen - left.daysOpen
      );
    })
    .map((request) => ({
      requestId: request.requestId,
      brokerName: request.brokerName,
      brokerDomain: request.brokerDomain,
      status: request.status,
      submittedAt: request.submittedAt.toISOString(),
      deadline: request.deadline?.toISOString() ?? null,
      lastActivityAt: request.lastActivityAt.toISOString(),
      reason: request.stallReason!,
      tone: request.stallTone!,
      daysOpen: request.daysOpen,
      daysRemaining: request.daysRemaining,
      replyCount: request.replyCount,
      requiresUserAction: request.requiresUserAction,
      pendingReview: request.pendingReview,
      pendingTaskTitle: request.pendingTaskTitle,
    }));
}

function getStallDescriptor(input: {
  open: boolean;
  overdue: boolean;
  daysOpen: number;
  daysRemaining: number | null;
  hasReply: boolean;
  lastActivityAt: Date;
  now: Date;
  pendingReview: boolean;
  requiresUserAction: boolean;
  pendingTaskDueAt: Date | null;
}): { reason: string; tone: ReportTone } | null {
  if (!input.open) {
    return null;
  }

  if (input.overdue) {
    const days = Math.abs(input.daysRemaining ?? 0);
    return {
      reason: `SLA overdue by ${days} day${days === 1 ? "" : "s"}.`,
      tone: "danger",
    };
  }

  if (input.pendingTaskDueAt) {
    const taskDaysRemaining = Math.ceil(
      (input.pendingTaskDueAt.getTime() - input.now.getTime()) / DAY_MS
    );

    if (taskDaysRemaining < 0) {
      const overdueDays = Math.abs(taskDaysRemaining);
      return {
        reason: `User follow-up overdue by ${overdueDays} day${
          overdueDays === 1 ? "" : "s"
        }.`,
        tone: "danger",
      };
    }

    if (taskDaysRemaining <= USER_TASK_WARNING_WINDOW_DAYS) {
      return {
        reason: `User follow-up due in ${taskDaysRemaining} day${
          taskDaysRemaining === 1 ? "" : "s"
        }.`,
        tone: taskDaysRemaining <= 1 ? "danger" : "warning",
      };
    }
  }

  if (input.pendingReview) {
    return {
      reason: "Reply or task still needs operator review.",
      tone: "warning",
    };
  }

  if (!input.hasReply && input.daysOpen >= NO_REPLY_WARNING_DAYS) {
    return {
      reason: `No meaningful broker reply after ${Math.floor(input.daysOpen)} day${
        Math.floor(input.daysOpen) === 1 ? "" : "s"
      }.`,
      tone: input.daysOpen >= NO_REPLY_DANGER_DAYS ? "danger" : "warning",
    };
  }

  if (input.daysRemaining !== null && input.daysRemaining <= SLA_WARNING_WINDOW_DAYS) {
    return {
      reason: `SLA deadline in ${Math.max(input.daysRemaining, 0)} day${
        Math.max(input.daysRemaining, 0) === 1 ? "" : "s"
      }.`,
      tone: input.daysRemaining <= 3 ? "danger" : "warning",
    };
  }

  if (input.requiresUserAction) {
    return {
      reason: "Waiting on user follow-up before the request can progress.",
      tone: "warning",
    };
  }

  const daysSinceLastActivity = roundToOne(
    (input.now.getTime() - input.lastActivityAt.getTime()) / DAY_MS
  );
  if (daysSinceLastActivity >= INACTIVITY_WARNING_DAYS) {
    return {
      reason: `No new activity for ${Math.floor(daysSinceLastActivity)} day${
        Math.floor(daysSinceLastActivity) === 1 ? "" : "s"
      }.`,
      tone:
        daysSinceLastActivity >= INACTIVITY_DANGER_DAYS ? "danger" : "warning",
    };
  }

  return null;
}

function buildCohort(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const monthName = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month];

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: `${monthName} ${year}`,
  };
}

function latestDate(dates: Array<Date | null | undefined>): Date {
  let latest = new Date(0);

  for (const date of dates) {
    if (!date) {
      continue;
    }

    if (date.getTime() > latest.getTime()) {
      latest = date;
    }
  }

  return latest;
}

function isAcknowledgmentLike(
  classification: ClassificationLabel | string | null
): boolean {
  return classification === "acknowledgment" || classification === "completion";
}

function toPercent(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return roundToOne((count / total) * 100);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function severityRank(tone: ReportTone | null): number {
  if (tone === "danger") {
    return 0;
  }

  if (tone === "warning") {
    return 1;
  }

  return 2;
}
