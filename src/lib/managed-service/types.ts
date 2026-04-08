export type ManagedServiceStatus =
  | "awaiting_payment"
  | "queued"
  | "active"
  | "completed"
  | "canceled";

export type ManagedServiceBillingStatus =
  | "invoice_pending"
  | "payment_submitted"
  | "paid"
  | "refunded";

export type ManagedServiceContactPreference = "email" | "dashboard";

export interface ManagedServicePackage {
  key: string;
  name: string;
  priceUsd: number;
  currency: string;
  cohortCapacity: number;
  supportEmail: string;
  supportHours: string;
  includedBrokerCount: number;
  includedFollowUpRounds: number;
  turnaroundSummary: string;
  supportWorkflowSummary: string;
  scopeHighlights: string[];
  exclusions: string[];
  workflowSteps: Array<{
    key: string;
    title: string;
    description: string;
  }>;
}

export interface ManagedServiceEnrollmentSummary {
  id: string;
  packageName: string;
  status: ManagedServiceStatus;
  billingStatus: ManagedServiceBillingStatus;
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
  contactPreference: ManagedServiceContactPreference;
  preferredStartWindow: string | null;
  notes: string | null;
  latestOperatorNote: string | null;
  requestedAt: string;
  paymentSubmittedAt: string | null;
  paidAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  nextCheckInAt: string | null;
}

export interface ManagedServiceWorkloadSnapshot {
  openRequests: number;
  stalledRequests: number;
  pendingTasks: number;
  pendingReview: number;
  completedRequests: number;
  generatedAt: string;
}

export interface ManagedServiceDashboardData {
  package: ManagedServicePackage;
  seatsFilled: number;
  seatsRemaining: number;
  workload: ManagedServiceWorkloadSnapshot;
  enrollment: ManagedServiceEnrollmentSummary | null;
}
