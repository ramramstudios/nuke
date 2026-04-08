"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SLACountdown } from "@/components/SLACountdown";
import { StatusBadge } from "@/components/StatusBadge";
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
  const [user, setUser] = useState<SessionUser | null>(null);
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
        setUser(mePayload.data);
        setError(getResponseErrorMessage(metricsPayload, "Could not load broker metrics."));
        setLoading(false);
        return;
      }

      setUser(mePayload.data);
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

  async function handleLogout() {
    setActionLoading("logout");
    await fetch("/api/auth/logout", { method: "POST" });
    setActionLoading("");
    router.push("/onboarding");
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading success metrics…</p>
      </main>
    );
  }

  const overview = report?.overview ?? null;

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Success Metrics and SLA Reporting</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
          <p className="text-gray-500 text-sm mt-2 max-w-3xl">
            Account-scoped operator reporting for broker requests that entered the
            workflow. Rates combine request state with classified broker replies so
            stalled requests are easier to spot before the SLA slips.
          </p>
          {report && (
            <p className="text-gray-600 text-xs mt-3">
              Last refreshed {formatDateTime(report.generatedAt)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/dashboard/scans"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            View Scan Results
          </Link>
          <Link
            href="/dashboard/review"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Review Queue
          </Link>
          <Link
            href="/dashboard/profile"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Edit Profile
          </Link>
          <button
            onClick={handleRefresh}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium text-gray-100 disabled:opacity-50 transition-colors"
          >
            {actionLoading === "refresh" ? "Refreshing…" : "Refresh Metrics"}
          </button>
          <button
            onClick={handleLogout}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            {actionLoading === "logout" ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!report || !overview || overview.totalRequests === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 px-6 py-16 text-center">
          <p className="text-lg text-gray-300">No broker workflow metrics yet.</p>
          <p className="mt-2 text-sm text-gray-500">
            Submit broker removals first, then this page will track reply rates,
            aging, and stalled requests.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Reply Rate"
              value={formatPercent(overview.replyRate)}
              hint={`${overview.repliedCount} of ${overview.totalRequests} requests received a meaningful reply`}
              accent="text-blue-300"
            />
            <MetricCard
              label="Acknowledgment Rate"
              value={formatPercent(overview.acknowledgmentRate)}
              hint={`${overview.acknowledgedCount} requests acknowledged or resolved`}
              accent="text-indigo-300"
            />
            <MetricCard
              label="Completion Rate"
              value={formatPercent(overview.completionRate)}
              hint={`${overview.completedCount} requests reached a completed outcome`}
              accent="text-emerald-300"
            />
            <MetricCard
              label="Average First Reply"
              value={formatHours(overview.averageFirstReplyHours)}
              hint="Measured from submission to the first meaningful broker reply"
              accent="text-cyan-300"
            />
            <MetricCard
              label="Open Request Aging"
              value={formatDays(overview.averageOpenAgeDays)}
              hint={`${overview.openCount} active requests still need a final outcome`}
              accent="text-slate-200"
            />
            <MetricCard
              label="Overdue Requests"
              value={overview.overdueCount}
              hint="Already beyond broker SLA deadline"
              accent="text-red-300"
            />
            <MetricCard
              label="Stalled Watchlist"
              value={overview.stalledCount}
              hint="Overdue, near-deadline, blocked, or inactive requests"
              accent="text-orange-300"
            />
            <MetricCard
              label="Needs Attention"
              value={`${overview.requiresUserActionCount} user / ${overview.pendingReviewCount} review`}
              hint="Requests waiting on user follow-up or operator review"
              accent="text-amber-200"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">SLA Watchlist</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Requests that are overdue, close to their deadline, waiting on a
                    user step, or have gone quiet long enough to deserve attention.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-black/20 px-3 py-2 text-sm text-gray-300">
                  {report.stalledRequests.length} watched request
                  {report.stalledRequests.length === 1 ? "" : "s"}
                </div>
              </div>

              {report.stalledRequests.length === 0 ? (
                <div className="mt-5 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-5 text-sm text-emerald-200">
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

            <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
              <h2 className="text-xl font-semibold text-white">Coverage Notes</h2>
              <div className="mt-4 space-y-4 text-sm leading-6 text-gray-300">
                <p>
                  Reply rate only counts meaningful broker replies. Noise-classified
                  auto-replies do not count toward broker responsiveness.
                </p>
                <p>
                  Acknowledgment and completion rates consider both explicit request
                  state and classified inbound replies, which keeps this page useful
                  even when a reply has landed but has not been manually promoted yet.
                </p>
                <p>
                  Cohorts are grouped by submission month so you can compare how more
                  recent batches are performing against older ones.
                </p>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Broker Performance</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Broker-by-broker reply, acknowledgment, completion, and aging
                  performance for the current account.
                </p>
              </div>
              <div className="text-sm text-gray-500">
                Sorted by stalled requests, then overdue count.
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr className="border-b border-gray-800">
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

          <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Cohort Trends</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Submission-month cohorts help show whether newer request batches are
                  aging or resolving differently than older ones.
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr className="border-b border-gray-800">
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
    </main>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent = "text-white",
}: {
  label: string;
  value: string | number;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
      <p className="text-sm uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${accent}`}>{value}</p>
      <p className="mt-3 text-sm leading-6 text-gray-400">{hint}</p>
    </div>
  );
}

function WatchlistCard({ request }: { request: StalledRequestReport }) {
  const toneClasses =
    request.tone === "danger"
      ? "border-red-900/60 bg-red-950/20"
      : request.tone === "warning"
        ? "border-orange-900/60 bg-orange-950/20"
        : "border-gray-800 bg-black/20";

  return (
    <article className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{request.brokerName}</h3>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-sm text-gray-400">{request.brokerDomain}</p>
          <p className="mt-3 text-sm leading-6 text-gray-200">{request.reason}</p>
          {request.pendingTaskTitle && (
            <p className="mt-2 text-sm text-orange-200">
              Pending task: {request.pendingTaskTitle}
            </p>
          )}
        </div>
        <div className="grid gap-2 text-sm text-gray-300 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <MetricPill label="Submitted" value={formatDateTime(request.submittedAt)} />
          <MetricPill label="Last activity" value={formatDateTime(request.lastActivityAt)} />
          <MetricPill label="Replies" value={request.replyCount} />
          <MetricPill
            label="SLA"
            value={<SLACountdown deadline={request.deadline} />}
          />
        </div>
      </div>
    </article>
  );
}

function BrokerRow({ broker }: { broker: BrokerSuccessMetric }) {
  return (
    <tr className="border-b border-gray-900 align-top last:border-none">
      <td className="py-4 pr-4">
        <div>
          <p className="font-medium text-white">{broker.brokerName}</p>
          <p className="mt-1 text-xs text-gray-500">
            {broker.domain} · {broker.category.replace(/_/g, " ")} · {broker.priority}
          </p>
        </div>
      </td>
      <td className="py-4 pr-4 text-gray-300">{broker.totalRequests}</td>
      <td className="py-4 pr-4 text-blue-200">
        {formatPercent(broker.replyRate)}
        <div className="mt-1 text-xs text-gray-500">{broker.repliedCount} replied</div>
      </td>
      <td className="py-4 pr-4 text-indigo-200">
        {formatPercent(broker.acknowledgmentRate)}
        <div className="mt-1 text-xs text-gray-500">
          {broker.acknowledgedCount} acknowledged
        </div>
      </td>
      <td className="py-4 pr-4 text-emerald-200">
        {formatPercent(broker.completionRate)}
        <div className="mt-1 text-xs text-gray-500">
          {broker.completedCount} completed
        </div>
      </td>
      <td className="py-4 pr-4 text-gray-300">
        {formatHours(broker.averageFirstReplyHours)}
      </td>
      <td className="py-4 pr-4 text-gray-300">
        {formatDays(broker.averageOpenAgeDays)}
      </td>
      <td className="py-4 pr-4">
        <div className="space-y-1 text-xs">
          <p className={broker.overdueCount > 0 ? "text-red-300" : "text-gray-500"}>
            {broker.overdueCount} overdue
          </p>
          <p className={broker.stalledCount > 0 ? "text-orange-300" : "text-gray-500"}>
            {broker.stalledCount} stalled
          </p>
          <p
            className={
              broker.requiresUserActionCount > 0 ? "text-amber-200" : "text-gray-500"
            }
          >
            {broker.requiresUserActionCount} waiting on user
          </p>
          <p
            className={
              broker.pendingReviewCount > 0 ? "text-cyan-200" : "text-gray-500"
            }
          >
            {broker.pendingReviewCount} pending review
          </p>
        </div>
      </td>
    </tr>
  );
}

function CohortRow({ cohort }: { cohort: CohortSuccessMetric }) {
  return (
    <tr className="border-b border-gray-900 align-top last:border-none">
      <td className="py-4 pr-4">
        <p className="font-medium text-white">{cohort.cohortLabel}</p>
      </td>
      <td className="py-4 pr-4 text-gray-300">{cohort.totalRequests}</td>
      <td className="py-4 pr-4 text-blue-200">{formatPercent(cohort.replyRate)}</td>
      <td className="py-4 pr-4 text-indigo-200">
        {formatPercent(cohort.acknowledgmentRate)}
      </td>
      <td className="py-4 pr-4 text-emerald-200">
        {formatPercent(cohort.completionRate)}
      </td>
      <td className="py-4 pr-4 text-gray-300">
        {formatHours(cohort.averageFirstReplyHours)}
      </td>
      <td className="py-4 pr-4 text-gray-300">
        {formatDays(cohort.averageOpenAgeDays)}
      </td>
      <td className="py-4 pr-4">
        <div className="space-y-1 text-xs">
          <p className={cohort.overdueCount > 0 ? "text-red-300" : "text-gray-500"}>
            {cohort.overdueCount} overdue
          </p>
          <p className={cohort.stalledCount > 0 ? "text-orange-300" : "text-gray-500"}>
            {cohort.stalledCount} stalled
          </p>
        </div>
      </td>
    </tr>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-100">{value}</div>
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
