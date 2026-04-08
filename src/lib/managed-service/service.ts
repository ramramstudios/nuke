import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSuccessMetricsReport } from "@/lib/reporting/metrics";
import type {
  ManagedServiceContactPreference,
  ManagedServiceDashboardData,
  ManagedServiceEnrollmentSummary,
  ManagedServicePackage,
} from "@/lib/managed-service/types";

const ACTIVE_SEAT_STATUSES = ["awaiting_payment", "queued", "active"];
const MANAGED_SERVICE_PACKAGE: Omit<ManagedServicePackage, "supportEmail"> = {
  key: "concierge-pilot-v1",
  name: "NUKE Concierge Pilot",
  priceUsd: 299,
  currency: "USD",
  cohortCapacity: 10,
  supportHours: "Monday-Friday, 9am-5pm Central",
  includedBrokerCount: 25,
  includedFollowUpRounds: 2,
  turnaroundSummary:
    "Kickoff within 2 business days after payment is submitted, weekly progress updates, and a closeout summary inside the standard broker SLA window.",
  supportWorkflowSummary:
    "Manual-invoice pilot with human submission review, follow-up handling, blocked-request triage, and dashboard status updates.",
  scopeHighlights: [
    "Human review of your current broker request batch and profile snapshot before concierge handling starts.",
    "Up to 25 broker requests included in the pilot package, with two human follow-up rounds for email-driven brokers.",
    "Weekly progress updates covering replies received, blocked requests, and next recommended actions.",
    "Priority handling for identity-check or confirmation-link requests surfaced by the inbox and review queue.",
  ],
  exclusions: [
    "No legal representation, notarized identity work, or custom enterprise privacy consulting.",
    "No automated form coverage beyond the product capabilities already in the app.",
    "No guarantee that every broker will complete removal within the same time window.",
  ],
  workflowSteps: [
    {
      key: "reserve",
      title: "Reserve your pilot slot",
      description:
        "Choose your contact preference, note any high-priority brokers, and agree to the package scope.",
    },
    {
      key: "invoice",
      title: "Submit manual payment",
      description:
        "Use the invoice reference from the dashboard to complete the pilot payment outside the app while Stripe remains a later milestone.",
    },
    {
      key: "kickoff",
      title: "Kickoff and human review",
      description:
        "The concierge team confirms the workload, reviews blocked requests, and schedules the first support checkpoint.",
    },
    {
      key: "followups",
      title: "Managed follow-ups",
      description:
        "NUKE continues automated workflows while the pilot layer tracks stalled requests, clarifies tasks, and keeps weekly progress visible.",
    },
    {
      key: "closeout",
      title: "Closeout summary",
      description:
        "You receive a final status summary covering completed brokers, still-pending requests, and any manual next steps.",
    },
  ],
};

export interface CreateManagedServiceEnrollmentInput {
  contactPreference: ManagedServiceContactPreference;
  preferredStartWindow?: string | null;
  notes?: string | null;
}

export type ManagedServiceUpdateAction = "mark_payment_sent" | "cancel";

export async function getManagedServiceDashboardData(
  userId: string
): Promise<ManagedServiceDashboardData> {
  const [seatsFilled, workload, enrollmentRecord] = await Promise.all([
    prisma.managedServiceEnrollment.count({
      where: {
        status: { in: ACTIVE_SEAT_STATUSES },
      },
    }),
    buildWorkloadSnapshot(userId),
    prisma.managedServiceEnrollment.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const packageInfo = getManagedServicePackage();

  return {
    package: packageInfo,
    seatsFilled,
    seatsRemaining: Math.max(packageInfo.cohortCapacity - seatsFilled, 0),
    workload,
    enrollment: enrollmentRecord ? mapEnrollment(enrollmentRecord) : null,
  };
}

export async function createManagedServiceEnrollment(
  userId: string,
  input: CreateManagedServiceEnrollmentInput
): Promise<ManagedServiceDashboardData> {
  const packageInfo = getManagedServicePackage();
  const [existingActiveEnrollment, seatsFilled, workload] = await Promise.all([
    prisma.managedServiceEnrollment.findFirst({
      where: {
        userId,
        status: { in: ACTIVE_SEAT_STATUSES },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.managedServiceEnrollment.count({
      where: { status: { in: ACTIVE_SEAT_STATUSES } },
    }),
    buildWorkloadSnapshot(userId),
  ]);

  if (existingActiveEnrollment) {
    throw new Error("You already have an active concierge pilot enrollment.");
  }

  if (seatsFilled >= packageInfo.cohortCapacity) {
    throw new Error("The current concierge pilot cohort is full.");
  }

  const now = new Date();
  const enrollment = await prisma.managedServiceEnrollment.create({
    data: {
      userId,
      packageKey: packageInfo.key,
      packageName: packageInfo.name,
      invoiceReference: await generateInvoiceReference(),
      priceUsd: packageInfo.priceUsd,
      currency: packageInfo.currency,
      includedBrokerCount: packageInfo.includedBrokerCount,
      includedFollowUpRounds: packageInfo.includedFollowUpRounds,
      turnaroundSummary: packageInfo.turnaroundSummary,
      supportWorkflowSummary: packageInfo.supportWorkflowSummary,
      currentOpenRequestCount: workload.openRequests,
      currentStalledRequestCount: workload.stalledRequests,
      currentPendingTaskCount: workload.pendingTasks,
      currentPendingReviewCount: workload.pendingReview,
      contactPreference: input.contactPreference,
      preferredStartWindow: cleanNullable(input.preferredStartWindow),
      notes: cleanNullable(input.notes),
      latestOperatorNote:
        "Pilot slot reserved. Use the invoice reference below when you send payment, and we will confirm kickoff in the dashboard.",
      requestedAt: now,
      nextCheckInAt: addDays(now, 1),
    },
  });

  return {
    package: packageInfo,
    seatsFilled: seatsFilled + 1,
    seatsRemaining: Math.max(packageInfo.cohortCapacity - (seatsFilled + 1), 0),
    workload,
    enrollment: mapEnrollment(enrollment),
  };
}

export async function updateManagedServiceEnrollment(
  userId: string,
  action: ManagedServiceUpdateAction
): Promise<ManagedServiceDashboardData> {
  const enrollment = await prisma.managedServiceEnrollment.findFirst({
    where: {
      userId,
      status: { in: ACTIVE_SEAT_STATUSES },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!enrollment) {
    throw new Error("No active concierge pilot enrollment was found.");
  }

  const now = new Date();

  if (action === "mark_payment_sent") {
    if (enrollment.billingStatus === "payment_submitted") {
      return getManagedServiceDashboardData(userId);
    }

    await prisma.managedServiceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "queued",
        billingStatus: "payment_submitted",
        paymentSubmittedAt: now,
        nextCheckInAt: addDays(now, 1),
        latestOperatorNote:
          "Payment marked as sent. The concierge team should confirm receipt and schedule kickoff within 2 business days.",
      },
    });
  }

  if (action === "cancel") {
    await prisma.managedServiceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "canceled",
        canceledAt: now,
        nextCheckInAt: null,
        latestOperatorNote:
          "Pilot enrollment canceled. You can rejoin a later cohort if seats are still available.",
      },
    });
  }

  return getManagedServiceDashboardData(userId);
}

export function getManagedServicePackage(): ManagedServicePackage {
  return {
    ...MANAGED_SERVICE_PACKAGE,
    supportEmail:
      process.env.MANAGED_SERVICE_SUPPORT_EMAIL?.trim() || "concierge@nuke.local",
  };
}

async function buildWorkloadSnapshot(userId: string) {
  const [report, pendingTasks] = await Promise.all([
    getSuccessMetricsReport(userId),
    prisma.userTask.count({
      where: {
        userId,
        status: "pending",
      },
    }),
  ]);

  return {
    openRequests: report.overview.openCount,
    stalledRequests: report.overview.stalledCount,
    pendingTasks,
    pendingReview: report.overview.pendingReviewCount,
    completedRequests: report.overview.completedCount,
    generatedAt: report.generatedAt,
  };
}

async function generateInvoiceReference(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `NUKE-${new Date().getUTCFullYear()}-${randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;
    const existing = await prisma.managedServiceEnrollment.findUnique({
      where: { invoiceReference: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Could not generate an invoice reference for the concierge pilot.");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function cleanNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mapEnrollment(
  enrollment: {
    id: string;
    packageName: string;
    status: string;
    billingStatus: string;
    invoiceReference: string;
    priceUsd: number;
    currency: string;
    includedBrokerCount: number;
    includedFollowUpRounds: number;
    turnaroundSummary: string;
    supportWorkflowSummary: string;
    currentOpenRequestCount: number;
    currentStalledRequestCount: number;
    currentPendingTaskCount: number;
    currentPendingReviewCount: number;
    contactPreference: string;
    preferredStartWindow: string | null;
    notes: string | null;
    latestOperatorNote: string | null;
    requestedAt: Date;
    paymentSubmittedAt: Date | null;
    paidAt: Date | null;
    activatedAt: Date | null;
    completedAt: Date | null;
    canceledAt: Date | null;
    nextCheckInAt: Date | null;
  }
): ManagedServiceEnrollmentSummary {
  return {
    id: enrollment.id,
    packageName: enrollment.packageName,
    status: enrollment.status as ManagedServiceEnrollmentSummary["status"],
    billingStatus:
      enrollment.billingStatus as ManagedServiceEnrollmentSummary["billingStatus"],
    invoiceReference: enrollment.invoiceReference,
    priceUsd: enrollment.priceUsd,
    currency: enrollment.currency,
    includedBrokerCount: enrollment.includedBrokerCount,
    includedFollowUpRounds: enrollment.includedFollowUpRounds,
    turnaroundSummary: enrollment.turnaroundSummary,
    supportWorkflowSummary: enrollment.supportWorkflowSummary,
    currentOpenRequestCount: enrollment.currentOpenRequestCount,
    currentStalledRequestCount: enrollment.currentStalledRequestCount,
    currentPendingTaskCount: enrollment.currentPendingTaskCount,
    currentPendingReviewCount: enrollment.currentPendingReviewCount,
    contactPreference:
      enrollment.contactPreference as ManagedServiceEnrollmentSummary["contactPreference"],
    preferredStartWindow: enrollment.preferredStartWindow,
    notes: enrollment.notes,
    latestOperatorNote: enrollment.latestOperatorNote,
    requestedAt: enrollment.requestedAt.toISOString(),
    paymentSubmittedAt: enrollment.paymentSubmittedAt?.toISOString() ?? null,
    paidAt: enrollment.paidAt?.toISOString() ?? null,
    activatedAt: enrollment.activatedAt?.toISOString() ?? null,
    completedAt: enrollment.completedAt?.toISOString() ?? null,
    canceledAt: enrollment.canceledAt?.toISOString() ?? null,
    nextCheckInAt: enrollment.nextCheckInAt?.toISOString() ?? null,
  };
}
