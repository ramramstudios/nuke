export type ReportTone = "neutral" | "warning" | "danger";

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
  brokers: BrokerSuccessMetric[];
  cohorts: CohortSuccessMetric[];
  stalledRequests: StalledRequestReport[];
}
