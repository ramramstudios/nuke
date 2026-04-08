"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SLACountdown } from "@/components/SLACountdown";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Banner,
  EmptyState,
  LoadingScreen,
  PageContent,
  PageHeader,
} from "@/components/ui";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";
import type {
  BrokerSuccessMetric,
  CohortSuccessMetric,
  StalledRequestReport,
  SuccessMetricsReport,
} from "@/lib/reporting/types";

interface SessionUser {
  email: string;
  hasProfile: boolean;
}

export default function MetricsPage() {
  const router = useRouter();
  const [report, setReport] = useState<SuccessMetricsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const mePayload = await parseJsonResponse<SessionUser>(meRes);

      if (cancelled) {
        return;
      }

      if (!meRes.ok) {
        if (meRes.status === 401) {
          router.replace("/onboarding");
          return;
        }

        setError(getResponseErrorMessage(mePayload, "Could not load your session."));
        setLoading(false);
        return;
      }

      if (!mePayload.data || !mePayload.data.hasProfile) {
        router.replace("/onboarding");
        return;
      }

      const metricsRes = await fetch("/api/metrics", { cache: "no-store" });
      const metricsPayload = await parseJsonResponse<SuccessMetricsReport>(metricsRes);

      if (cancelled) {
        return;
      }

      if (!metricsRes.ok || !metricsPayload.data) {
        setError(getResponseErrorMessage(metricsPayload, "Could not load broker metrics."));
        setLoading(false);
        return;
      }

      setReport(metricsPayload.data);
      setError("");
      setLoading(false);
    }

    void loadMetrics();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleRefresh() {
    setActionLoading("refresh");
    const res = await fetch("/api/metrics", { cache: "no-store" });
    const payload = await parseJsonResponse<SuccessMetricsReport>(res);
    setActionLoading("");

    if (!res.ok || !payload.data) {
      setError(getResponseErrorMessage(payload, "Could not refresh broker metrics."));
      return;
    }

    setReport(payload.data);
    setError("");
  }

  if (loading) {
    return <LoadingScreen message="Loading success metrics…" />;
  }

  const overview = report?.overview ?? null;

  return (
      <PageContent wide>
        <PageHeader
          title="Success Metrics and SLA Reporting"
          subtitle="Account-scoped operator reporting for broker requests that entered the workflow. Rates combine request state with classified broker replies so stalled requests are easier to spot before the SLA slips."
          detail={report ? `Last refreshed ${formatDateTime(report.generatedAt)}` : undefined}
          actions={
            <button
              onClick={handleRefresh}
              disabled={!!actionLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors border"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              {actionLoading === "refresh" ? "Refreshing…" : "Refresh Metrics"}
            </button>
          }
        />

        {error && <Banner tone="error">{error}</Banner>}

        {!report || !overview || overview.totalRequests === 0 ? (
          <EmptyState
            title="No broker workflow metrics yet."
            body="Submit broker removals first, then this page will track reply rates, aging, and stalled requests."
          />
        ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Reply Rate" value={formatPercent(overview.replyRate)} hint={`${overview.repliedCount} of ${overview.totalRequests} requests received a meaningful reply`} />
            <MetricCard label="Acknowledgment Rate" value={formatPercent(overview.acknowledgmentRate)} hint={`${overview.acknowledgedCount} requests acknowledged or resolved`} />
            <MetricCard label="Completion Rate" value={formatPercent(overview.completionRate)} hint={`${overview.completedCount} requests reached a completed outcome`} />
            <MetricCard label="Average First Reply" value={formatHours(overview.averageFirstReplyHours)} hint="Measured from submission to the first meaningful broker reply" />
            <MetricCard label="Open Request Aging" value={formatDays(overview.averageOpenAgeDays)} hint={`${overview.openCount} active requests still need a final outcome`} />
            <MetricCard label="Overdue Requests" value={overview.overdueCount} hint="Already beyond broker SLA deadline" />
            <MetricCard label="Stalled Watchlist" value={overview.stalledCount} hint="Overdue, near-deadline, blocked, or inactive requests" />
            <MetricCard label="Needs Attention" value={`${overview.requiresUserActionCount} user / ${overview.pendingReviewCount} review`} hint="Requests waiting on user follow-up or operator review" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <section className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>SLA Watchlist</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Requests that are overdue, close to their deadline, waiting on a
                    user step, or have gone quiet long enough to deserve attention.
                  </p>
                </div>
                <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)", color: "var(--text-2)" }}>
                  {report.stalledRequests.length} watched request
                  {report.stalledRequests.length === 1 ? "" : "s"}
                </div>
              </div>
              {report.stalledRequests.length === 0 ? (
                <div className="mt-5 rounded-xl border px-4 py-5 text-sm" style={{ borderColor: "rgba(6,95,70,0.4)", background: "rgba(6,78,59,0.15)", color: "#6ee7b7" }}>
                  No requests are currently at risk of missing their SLA.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {report.stalledRequests.map((request) => (
                    <WatchlistCard key={request.requestId} request={request} />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Coverage Notes</h2>
              <div className="mt-4 space-y-4 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                <p>Reply rate only counts meaningful broker replies. Noise-classified auto-replies do not count toward broker responsiveness.</p>
                <p>Acknowledgment and completion rates consider both explicit request state and classified inbound replies, which keeps this page useful even when a reply has landed but has not been manually promoted yet.</p>
                <p>Cohorts are grouped by submission month so you can compare how more recent batches are performing against older ones.</p>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Broker Performance</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Broker-by-broker reply, acknowledgment, completion, and aging performance for the current account.</p>
              </div>
              <div className="text-sm" style={{ color: "var(--text-faint)" }}>Sorted by stalled requests, then overdue count.</div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left" style={{ color: "var(--text-faint)" }}>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="pb-3 pr-4 font-medium">Broker</th>
                    <th className="pb-3 pr-4 font-medium">Requests</th>
                    <th className="pb-3 pr-4 font-medium">Reply</th>
                    <th className="pb-3 pr-4 font-medium">Ack</th>
                    <th className="pb-3 pr-4 font-medium">Complete</th>
                    <th className="pb-3 pr-4 font-medium">Avg First Reply</th>
                    <th className="pb-3 pr-4 font-medium">Avg Open Age</th>
                    <th className="pb-3 pr-4 font-medium">Attention</th>
                  </tr>
                </thead>
                <tbody>
                  {report.brokers.map((broker) => (
                    <BrokerRow key={broker.brokerId} broker={broker} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Cohort Trends</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Submission-month cohorts help show whether newer request batches are aging or resolving differently than older ones.</p>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left" style={{ color: "var(--text-faint)" }}>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="pb-3 pr-4 font-medium">Cohort</th>
                    <th className="pb-3 pr-4 font-medium">Requests</th>
                    <th className="pb-3 pr-4 font-medium">Reply</th>
                    <th className="pb-3 pr-4 font-medium">Ack</th>
                    <th className="pb-3 pr-4 font-medium">Complete</th>
                    <th className="pb-3 pr-4 font-medium">Avg First Reply</th>
                    <th className="pb-3 pr-4 font-medium">Avg Open Age</th>
                    <th className="pb-3 pr-4 font-medium">Overdue / Stalled</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cohorts.map((cohort) => (
                    <CohortRow key={cohort.cohortKey} cohort={cohort} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
        )}
      </PageContent>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <p className="text-sm uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
      <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{hint}</p>
    </div>
  );
}

function WatchlistCard({ request }: { request: StalledRequestReport }) {
  const toneStyle =
    request.tone === "danger"
      ? { borderColor: "rgba(153,27,27,0.5)", background: "rgba(127,29,29,0.15)" }
      : request.tone === "warning"
        ? { borderColor: "rgba(146,64,14,0.5)", background: "rgba(120,53,15,0.15)" }
        : { borderColor: "var(--border)", background: "var(--bg-subtle)" };

  return (
    <article className="rounded-xl border p-4" style={toneStyle}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{request.brokerName}</h3>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{request.brokerDomain}</p>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-2)" }}>{request.reason}</p>
          {request.pendingTaskTitle && (
            <p className="mt-2 text-sm text-orange-300">Pending task: {request.pendingTaskTitle}</p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <MetricPill label="Submitted" value={formatDateTime(request.submittedAt)} />
          <MetricPill label="Last activity" value={formatDateTime(request.lastActivityAt)} />
          <MetricPill label="Replies" value={request.replyCount} />
          <MetricPill label="SLA" value={<SLACountdown deadline={request.deadline} />} />
        </div>
      </div>
    </article>
  );
}

function BrokerRow({ broker }: { broker: BrokerSuccessMetric }) {
  return (
    <tr className="align-top" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="py-4 pr-4">
        <p className="font-medium" style={{ color: "var(--text)" }}>{broker.brokerName}</p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
          {broker.domain} · {broker.category.replace(/_/g, " ")} · {broker.priority}
        </p>
      </td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{broker.totalRequests}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>
        {formatPercent(broker.replyRate)}
        <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{broker.repliedCount} replied</div>
      </td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>
        {formatPercent(broker.acknowledgmentRate)}
        <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{broker.acknowledgedCount} acknowledged</div>
      </td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>
        {formatPercent(broker.completionRate)}
        <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{broker.completedCount} completed</div>
      </td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatHours(broker.averageFirstReplyHours)}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatDays(broker.averageOpenAgeDays)}</td>
      <td className="py-4 pr-4">
        <div className="space-y-1 text-xs">
          <p style={{ color: broker.overdueCount > 0 ? "#fca5a5" : "var(--text-faint)" }}>{broker.overdueCount} overdue</p>
          <p style={{ color: broker.stalledCount > 0 ? "#fdba74" : "var(--text-faint)" }}>{broker.stalledCount} stalled</p>
          <p style={{ color: broker.requiresUserActionCount > 0 ? "#fde68a" : "var(--text-faint)" }}>{broker.requiresUserActionCount} waiting on user</p>
          <p style={{ color: broker.pendingReviewCount > 0 ? "#a5f3fc" : "var(--text-faint)" }}>{broker.pendingReviewCount} pending review</p>
        </div>
      </td>
    </tr>
  );
}

function CohortRow({ cohort }: { cohort: CohortSuccessMetric }) {
  return (
    <tr className="align-top" style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="py-4 pr-4 font-medium" style={{ color: "var(--text)" }}>{cohort.cohortLabel}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{cohort.totalRequests}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatPercent(cohort.replyRate)}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatPercent(cohort.acknowledgmentRate)}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatPercent(cohort.completionRate)}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatHours(cohort.averageFirstReplyHours)}</td>
      <td className="py-4 pr-4" style={{ color: "var(--text-2)" }}>{formatDays(cohort.averageOpenAgeDays)}</td>
      <td className="py-4 pr-4">
        <div className="space-y-1 text-xs">
          <p style={{ color: cohort.overdueCount > 0 ? "#fca5a5" : "var(--text-faint)" }}>{cohort.overdueCount} overdue</p>
          <p style={{ color: cohort.stalledCount > 0 ? "#fdba74" : "var(--text-faint)" }}>{cohort.stalledCount} stalled</p>
        </div>
      </td>
    </tr>
  );
}

function MetricPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
      <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>{label}</p>
      <div className="mt-1 text-sm" style={{ color: "var(--text)" }}>{value}</div>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (value >= 24) {
    return `${(value / 24).toFixed(1)}d`;
  }

  return `${value.toFixed(1)}h`;
}

function formatDays(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(1)}d`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}
