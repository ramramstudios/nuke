import type {
  BrokerCoverageMetric,
  BrokerCoverageStatus,
} from "@/lib/reporting/types";

export type SelfServePlanKey =
  | "free-self-serve"
  | "assisted-self-serve"
  | "concierge-managed";

export type SelfServePlanSelectionStatus =
  | "active"
  | "superseded"
  | "canceled";

export type ConsumerCoverageBucket = "automatic" | "chore" | "managed";

export interface ConsumerBrokerCoverage {
  brokerId: string;
  brokerName: string;
  domain: string;
  category: string;
  priority: string;
  removalMethod: string;
  bucket: ConsumerCoverageBucket;
  bucketLabel: string;
  bucketReason: string;
  /** Whether the user must do a chore step now (regardless of bucket). */
  hasOpenChore: boolean;
  /** Coverage status from the operator-side metrics this view was derived from. */
  operatorCoverageStatus: BrokerCoverageStatus;
  topBlockerType: string | null;
  totalRequests: number;
  completedCount: number;
  handoffCount: number;
  nextStep: string;
}

export interface ConsumerCoverageBucketSummary {
  bucket: ConsumerCoverageBucket;
  label: string;
  description: string;
  brokerCount: number;
  brokerNames: string[];
  outstandingChoreCount: number;
}

export interface ConsumerCoverageReport {
  generatedAt: string;
  totalBrokerCount: number;
  automaticCount: number;
  choreCount: number;
  managedCount: number;
  automaticRate: number;
  outstandingChoreCount: number;
  blockedBrokerNames: string[];
  buckets: ConsumerCoverageBucketSummary[];
  brokers: ConsumerBrokerCoverage[];
}

export interface SelfServePlanInclusion {
  label: string;
  detail: string;
}

export interface SelfServePlanCatalogEntry {
  key: SelfServePlanKey;
  name: string;
  tagline: string;
  /** Display price in dollars; 0 means free. */
  priceUsd: number;
  cadence: "free" | "monthly";
  /** Recommended badge copy when the plan matches the account state best. */
  recommendation: string;
  /** Higher-level summary of what the plan does for the user. */
  summary: string;
  /** Buckets the plan covers automatically without user action. */
  coversBuckets: ConsumerCoverageBucket[];
  /** Buckets the plan still expects the user to handle as a short chore. */
  userHandlesBuckets: ConsumerCoverageBucket[];
  inclusions: SelfServePlanInclusion[];
  exclusions: string[];
  /** Acknowledgements the user must check before selecting the plan. */
  acknowledgements: Array<{
    key: "chore_scope" | "managed_handoff";
    label: string;
  }>;
}

export interface SelfServePlanRecommendation {
  recommendedPlanKey: SelfServePlanKey;
  reason: string;
}

export interface SelfServePlanSelectionSummary {
  id: string;
  planKey: SelfServePlanKey;
  status: SelfServePlanSelectionStatus;
  automaticBrokerCount: number;
  choreBrokerCount: number;
  managedBrokerCount: number;
  totalBrokerCount: number;
  acknowledgedChoreScope: boolean;
  acknowledgedManagedHandoff: boolean;
  notes: string | null;
  selectedAt: string;
  supersededAt: string | null;
  canceledAt: string | null;
}

export interface SelfServePlanDashboardData {
  generatedAt: string;
  catalog: SelfServePlanCatalogEntry[];
  recommendation: SelfServePlanRecommendation;
  coverage: ConsumerCoverageReport;
  activeSelection: SelfServePlanSelectionSummary | null;
  history: SelfServePlanSelectionSummary[];
  /** Whether a managed-service enrollment is already active for this user. */
  hasActiveManagedEnrollment: boolean;
}

export type ConsumerCoverageInput = Pick<
  BrokerCoverageMetric,
  | "brokerId"
  | "brokerName"
  | "domain"
  | "category"
  | "priority"
  | "removalMethod"
  | "coverageStatus"
  | "topBlockerType"
  | "totalRequests"
  | "completedCount"
  | "handoffCount"
  | "hasFormRunner"
>;
