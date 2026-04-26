export type ReportTone = "neutral" | "warning" | "danger";
export type BrokerCoverageStatus = "automatic" | "assisted" | "blocked" | "manual";

export interface BrokerCoverageBlockerMetric {
  blockerType: string;
  count: number;
}

export interface BrokerAutomationJobCounts {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  canceled: number;
}

export interface MetricsOverview {
  totalRequests: number;
  repliedCount: number;
  replyRate: number;
  acknowledgedCount: number;
  acknowledgmentRate: number;
  completedCount: number;
  completionRate: number;
  openCount: number;
  overdueCount: number;
  stalledCount: number;
  requiresUserActionCount: number;
  pendingReviewCount: number;
  averageFirstReplyHours: number | null;
  averageOpenAgeDays: number | null;
}

export interface BrokerSuccessMetric {
  brokerId: string;
  brokerName: string;
  domain: string;
  category: string;
  priority: string;
  totalRequests: number;
  repliedCount: number;
  replyRate: number;
  acknowledgedCount: number;
  acknowledgmentRate: number;
  completedCount: number;
  completionRate: number;
  openCount: number;
  overdueCount: number;
  stalledCount: number;
  requiresUserActionCount: number;
  pendingReviewCount: number;
  averageFirstReplyHours: number | null;
  averageOpenAgeDays: number | null;
}

export interface BrokerCoverageMetric {
  brokerId: string;
  brokerName: string;
  domain: string;
  category: string;
  priority: string;
  removalMethod: string;
  coverageStatus: BrokerCoverageStatus;
  coverageLabel: string;
  coverageReason: string;
  hasFormRunner: boolean;
  totalRequests: number;
  submittedCount: number;
  completedCount: number;
  handoffCount: number;
  handoffRate: number;
  blockerCount: number;
  topBlockerType: string | null;
  blockerBreakdown: BrokerCoverageBlockerMetric[];
  automationJobCounts: BrokerAutomationJobCounts;
  evidenceCount: number;
  lastAutomationAt: string | null;
  lastBlockerType: string | null;
  nextAction: string;
}

export interface CoverageMetricsReport {
  activeBrokerCount: number;
  automaticCount: number;
  assistedCount: number;
  blockedCount: number;
  manualCount: number;
  automationReadyCount: number;
  automationReadyRate: number;
  handoffCount: number;
  handoffRate: number;
  blockerCount: number;
  mostCommonBlocker: BrokerCoverageBlockerMetric | null;
  queuedJobs: number;
  runningJobs: number;
  failedJobs: number;
  brokers: BrokerCoverageMetric[];
}

export interface CohortSuccessMetric {
  cohortKey: string;
  cohortLabel: string;
  totalRequests: number;
  repliedCount: number;
  replyRate: number;
  acknowledgedCount: number;
  acknowledgmentRate: number;
  completedCount: number;
  completionRate: number;
  openCount: number;
  overdueCount: number;
  stalledCount: number;
  averageFirstReplyHours: number | null;
  averageOpenAgeDays: number | null;
}

export interface StalledRequestReport {
  requestId: string;
  brokerName: string;
  brokerDomain: string;
  status: string;
  submittedAt: string;
  deadline: string | null;
  lastActivityAt: string;
  reason: string;
  tone: ReportTone;
  daysOpen: number;
  daysRemaining: number | null;
  replyCount: number;
  requiresUserAction: boolean;
  pendingReview: boolean;
  pendingTaskTitle: string | null;
}

export interface SuccessMetricsReport {
  generatedAt: string;
  overview: MetricsOverview;
  coverage: CoverageMetricsReport;
  brokers: BrokerSuccessMetric[];
  cohorts: CohortSuccessMetric[];
  stalledRequests: StalledRequestReport[];
}
