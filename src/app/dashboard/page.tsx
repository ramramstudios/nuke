"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { SLACountdown } from "@/components/SLACountdown";
import {
  Banner,
  LoadingScreen,
  PageContent,
  PageHeader,
  StatCard,
} from "@/components/ui";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";
import type { TimelineEvent, TimelineTone } from "@/lib/compliance/timeline";

interface Summary {
  total: number;
  pending: number;
  submitted: number;
  acknowledged: number;
  completed: number;
  rejected: number;
  requiresUserAction: number;
  overdue: number;
}

interface RemovalRequest {
  id: string;
  status: string;
  method: string;
  removalUrl: string | null;
  deadline: string | null;
  submittedAt: string | null;
  sentAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  attemptCount: number;
  replyToAddress: string | null;
  broker: {
    name: string;
    domain: string;
    category: string;
    removalEndpoint?: string | null;
  };
}

interface CustomReq {
  id: string;
  targetUrl: string;
  status: string;
  removalUrl: string | null;
  createdAt: string;
}

interface UserTask {
  id: string;
  actionType: string;
  title: string;
  instructions: string;
  actionUrl: string | null;
  dueAt: string | null;
  status: string;
  broker: { name: string; domain: string } | null;
}

interface DashboardData {
  user: { email: string; hasProfile: boolean };
  summary: Summary | null;
  requests: RemovalRequest[];
  customRequests: CustomReq[];
  tasks: UserTask[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; hasProfile: boolean } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [requests, setRequests] = useState<RemovalRequest[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomReq[]>([]);
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false);
  const [error, setError] = useState("");

  // Timeline state: requestId → events (null = loading, [] = loaded empty)
  const [openTimeline, setOpenTimeline] = useState<string | null>(null);
  const [timelineData, setTimelineData] = useState<Record<string, TimelineEvent[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<Record<string, string>>({});

  // Custom request form
  const [customUrl, setCustomUrl] = useState("");

  async function fetchDashboardData(): Promise<DashboardData | null> {
    const meRes = await fetch("/api/auth/me");
    const mePayload = await parseJsonResponse<{ email: string; hasProfile: boolean }>(meRes);

    if (!meRes.ok) {
      if (meRes.status === 401) {
        return null;
      }

      throw new Error(
        getResponseErrorMessage(mePayload, "Could not load your session.")
      );
    }

    if (!mePayload.data) {
      throw new Error(
        getResponseErrorMessage(mePayload, "Could not read your session.")
      );
    }

    const me = mePayload.data;
    if (!me.hasProfile) {
      return null;
    }

    const [summaryRes, detailRes, customRes, tasksRes] = await Promise.all([
      fetch("/api/requests"),
      fetch("/api/requests?detail=true"),
      fetch("/api/custom-request"),
      fetch("/api/tasks"),
    ]);

    const [summaryPayload, detailPayload, customPayload, tasksPayload] =
      await Promise.all([
        parseJsonResponse<Summary>(summaryRes),
        parseJsonResponse<RemovalRequest[]>(detailRes),
        parseJsonResponse<CustomReq[]>(customRes),
        parseJsonResponse<UserTask[]>(tasksRes),
      ]);

    if (!summaryRes.ok || !summaryPayload.data) {
      throw new Error(
        getResponseErrorMessage(
          summaryPayload,
          "Could not load dashboard summary."
        )
      );
    }

    if (!detailRes.ok || !detailPayload.data) {
      throw new Error(
        getResponseErrorMessage(
          detailPayload,
          "Could not load broker request details."
        )
      );
    }

    if (!customRes.ok || !customPayload.data) {
      throw new Error(
        getResponseErrorMessage(
          customPayload,
          "Could not load custom request history."
        )
      );
    }

    if (!tasksRes.ok || !tasksPayload.data) {
      throw new Error(
        getResponseErrorMessage(tasksPayload, "Could not load your action items.")
      );
    }

    return {
      user: me,
      summary: summaryPayload.data,
      requests: detailPayload.data,
      customRequests: customPayload.data,
      tasks: tasksPayload.data,
    };
  }

  function applyDashboardData(data: DashboardData) {
    setUser(data.user);
    setSummary(data.summary);
    setRequests(data.requests);
    setCustomRequests(data.customRequests);
    setTasks(data.tasks);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const data = await fetchDashboardData();
        if (cancelled) return;
        if (!data) {
          router.push("/onboarding");
          return;
        }
        setError("");
        applyDashboardData(data);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load your dashboard."
        );
        setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function refreshDashboard() {
    try {
      const data = await fetchDashboardData();
      if (!data) {
        router.push("/onboarding");
        return;
      }
      setError("");
      applyDashboardData(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not refresh your dashboard."
      );
    }
  }

  async function handleScan() {
    setActionLoading("scan");
    const res = await fetch("/api/scan", { method: "POST" });
    setActionLoading("");
    if (res.ok) {
      router.push("/dashboard/scans");
      return;
    }
    await refreshDashboard();
  }

  async function submitRemovalNow() {
    setActionLoading("remove");
    await fetch("/api/requests", { method: "POST" });
    setActionLoading("");
    await refreshDashboard();
  }

  async function handleSubmitRemoval() {
    if (latestSubmittedAt) {
      setShowResubmitConfirm(true);
      return;
    }

    await submitRemovalNow();
  }

  async function handleConfirmResubmit() {
    setShowResubmitConfirm(false);
    await submitRemovalNow();
  }

  async function handleCustomRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!customUrl) return;
    setActionLoading("custom");
    await fetch("/api/custom-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: customUrl }),
    });
    setCustomUrl("");
    setActionLoading("");
    await refreshDashboard();
  }

  async function handleTaskAction(taskId: string, status: "completed" | "dismissed") {
    setActionLoading(`task-${taskId}`);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setActionLoading("");
    await refreshDashboard();
  }

  async function handleToggleTimeline(requestId: string) {
    // Collapse if already open
    if (openTimeline === requestId) {
      setOpenTimeline(null);
      return;
    }

    setOpenTimeline(requestId);

    // Already fetched — reuse cached data and clear any stale error
    if (requestId in timelineData) {
      setTimelineError((prev) => {
        if (!(requestId in prev)) return prev;
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      return;
    }

    setTimelineError((prev) => {
      if (!(requestId in prev)) return prev;
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
    setTimelineLoading(requestId);
    try {
      const res = await fetch(`/api/requests/${requestId}/timeline`);
      const payload = await parseJsonResponse<TimelineEvent[]>(res);
      if (!res.ok || !payload.data) {
        setTimelineError((prev) => ({
          ...prev,
          [requestId]: getResponseErrorMessage(
            payload,
            "Could not load the communication timeline."
          ),
        }));
      } else {
        setTimelineError((prev) => {
          if (!(requestId in prev)) return prev;
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        setTimelineData((prev) => ({ ...prev, [requestId]: payload.data! }));
      }
    } catch {
      setTimelineError((prev) => ({
        ...prev,
        [requestId]: "Could not load the communication timeline.",
      }));
    } finally {
      setTimelineLoading(null);
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading…" />;
  }

  const latestSubmittedAt = requests
    .map((req) => req.submittedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const emailedCount = requests.filter((req) => Boolean(req.sentAt)).length;
  const deliveryIssueCount = requests.filter((req) => Boolean(req.lastError)).length;
  const manualFallbackRequests = requests.filter((req) => isManualFallback(req));
  const manualFallbackCount = manualFallbackRequests.length;
  const inboxWatchRequests = requests.filter((req) => shouldMonitorPersonalInbox(req));
  const inboxWatchAddresses = [
    ...new Set(
      inboxWatchRequests
        .map((req) => req.replyToAddress)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const loginDiffersFromReplyInbox = Boolean(
    user?.email &&
      inboxWatchAddresses.some(
        (address) => address.toLowerCase() !== user.email.toLowerCase()
      )
  );

  return (
      <PageContent>
      {showResubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div
            className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
            style={{
              borderColor: "rgba(146,64,14,0.55)",
              background: "var(--surface)",
            }}
          >
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: "#fb923c" }}>
                  Resubmit Warning
                </p>
                <h2 className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>
                  A removal request was already sent
                </h2>
              </div>

              <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                We already have a pending removal workflow that was submitted at{" "}
                <span className="font-medium" style={{ color: "var(--text)" }}>
                  {formatDateTime(latestSubmittedAt)}
                </span>
                . Sending another batch right now is not advised because it can
                spam brokers and make the results less effective.
              </p>

              <p className="text-sm leading-6" style={{ color: "var(--text-faint)" }}>
                In the future we plan to block repeat submissions entirely for
                active requests. If you still want to force another round, you
                can continue below.
              </p>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowResubmitConfirm(false)}
                  disabled={!!actionLoading}
                  className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResubmit}
                  disabled={!!actionLoading}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: "#ea580c" }}
                >
                  {actionLoading === "remove" ? "Resubmitting…" : "Resubmit Anyway"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <button
              onClick={handleScan}
              disabled={!!actionLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors border"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
            >
              {actionLoading === "scan" ? "Scanning…" : "Run Scan"}
            </button>
            <button
              onClick={handleSubmitRemoval}
              disabled={!!actionLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors text-white"
              style={{ background: "var(--accent)" }}
            >
              {actionLoading === "remove" ? "Submitting…" : "Submit Removal"}
            </button>
          </>
        }
      />

      {error && <Banner tone="error">{error}</Banner>}

      {/* Summary Cards */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Requests" value={summary.total} />
          <StatCard label="Completed" value={summary.completed} />
          <StatCard label="Pending Action" value={summary.requiresUserAction} />
          <StatCard label="Overdue" value={summary.overdue} accent={summary.overdue > 0} />
        </div>
      )}

      {requests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text)" }}>Delivery Visibility</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Broker Emails Sent" value={emailedCount} />
            <StatCard label="Delivery Issues" value={deliveryIssueCount} accent={deliveryIssueCount > 0} />
            <StatCard label="Manual Fallbacks" value={manualFallbackCount} accent={manualFallbackCount > 0} />
          </div>
        </section>
      )}

      {manualFallbackRequests.length > 0 && (
        <section>
          <div
            className="rounded-2xl border p-5"
            style={{
              borderColor: "rgba(146,64,14,0.55)",
              background: "rgba(120,53,15,0.15)",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: "#fb923c" }}>
                  Manual Follow-Up Needed
                </p>
                <h2 className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>
                  Some brokers could not be contacted automatically
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  We already tried the email route for these brokers and it failed.
                  We have switched each one to a direct broker opt-out link so you can
                  finish the request yourself without leaving the dashboard guessing what
                  happened next.
                </p>
              </div>
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: "rgba(146,64,14,0.55)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#fdba74",
                }}
              >
                {manualFallbackRequests.length} broker
                {manualFallbackRequests.length === 1 ? "" : "s"} need manual follow-up
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {manualFallbackRequests.map((req) => {
                const nextSteps = getManualFallbackSteps(req);

                return (
                  <article
                    key={`fallback-${req.id}`}
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: "rgba(146,64,14,0.45)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                          {req.broker.name}
                        </h3>
                        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                          {getManualFallbackSummary(req)}
                        </p>
                      </div>
                      {req.removalUrl && (
                        <a
                          href={req.removalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                          style={{ background: "#ea580c" }}
                        >
                          Open broker opt-out page
                        </a>
                      )}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div
                        className="rounded-lg border p-4"
                        style={{
                          borderColor: "rgba(146,64,14,0.4)",
                          background: "rgba(120,53,15,0.12)",
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#fdba74" }}>
                          What Happened
                        </p>
                        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                          {getManualFallbackWhatHappened(req)}
                        </p>
                        {req.lastError && (
                          <p className="mt-3 text-xs leading-5" style={{ color: "#fca5a5" }}>
                            Last failure: {trimMessage(req.lastError, 220)}
                          </p>
                        )}
                      </div>

                      <div
                        className="rounded-lg border p-4"
                        style={{
                          borderColor: "rgba(146,64,14,0.4)",
                          background: "rgba(120,53,15,0.12)",
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#fdba74" }}>
                          What To Do Next
                        </p>
                        <ol className="mt-2 space-y-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                          {nextSteps.map((step, index) => (
                            <li key={`${req.id}-step-${index}`}>
                              <span className="mr-2 font-semibold" style={{ color: "#fdba74" }}>
                                {index + 1}.
                              </span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {inboxWatchRequests.length > 0 && (
        <section>
          <div
            className="rounded-2xl border p-5"
            style={{
              borderColor: "rgba(29,78,216,0.45)",
              background: "rgba(30,64,175,0.12)",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: "#93c5fd" }}>
                  Check Your Personal Inbox
                </p>
                <h2 className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>
                  Some broker replies may bypass NUKE
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  These broker emails were sent with your personal profile address as the
                  reply target, so identity checks, confirmation links, and completion
                  notices can arrive there instead of back inside the app.
                </p>
                {inboxWatchAddresses.length > 0 && (
                  <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                    Watch{" "}
                    <span className="font-medium" style={{ color: "var(--text)" }}>
                      {inboxWatchAddresses.join(", ")}
                    </span>{" "}
                    for broker replies.
                  </p>
                )}
                {loginDiffersFromReplyInbox && user?.email && (
                  <p className="mt-2 text-xs leading-5" style={{ color: "#bfdbfe" }}>
                    Your NUKE login email is {user.email}, which is different from the
                    inbox brokers may be using for follow-up.
                  </p>
                )}
              </div>
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  borderColor: "rgba(29,78,216,0.45)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#bfdbfe",
                }}
              >
                {inboxWatchRequests.length} broker
                {inboxWatchRequests.length === 1 ? "" : "s"} may reply outside the app
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {inboxWatchRequests.map((req) => {
                const nextSteps = getPersonalInboxSteps(req);

                return (
                  <article
                    key={`inbox-watch-${req.id}`}
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: "rgba(29,78,216,0.4)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                            {req.broker.name}
                          </h3>
                          <StatusBadge status={req.status} />
                        </div>
                        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                          {req.sentAt
                            ? `Broker email sent ${formatDateTime(req.sentAt)}.`
                            : "Broker email delivery is in progress."}{" "}
                          Replies may go to{" "}
                          <span className="font-medium" style={{ color: "var(--text)" }}>
                            {req.replyToAddress}
                          </span>
                          .
                        </p>
                      </div>
                      <div
                        className="rounded-lg border px-3 py-2 text-xs"
                        style={{
                          borderColor: "rgba(29,78,216,0.4)",
                          background: "rgba(30,64,175,0.12)",
                          color: "#bfdbfe",
                        }}
                      >
                        Watch for mail from {getBrokerReplyHint(req)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div
                        className="rounded-lg border p-4"
                        style={{
                          borderColor: "rgba(29,78,216,0.35)",
                          background: "rgba(30,64,175,0.1)",
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#93c5fd" }}>
                          Why This Matters
                        </p>
                        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                          If {req.broker.name} asks for identity verification or sends a
                          confirmation link to your personal inbox, NUKE will not know
                          about that action until you complete it or route the reply back
                          into the app later.
                        </p>
                      </div>

                      <div
                        className="rounded-lg border p-4"
                        style={{
                          borderColor: "rgba(29,78,216,0.35)",
                          background: "rgba(30,64,175,0.1)",
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "#93c5fd" }}>
                          What To Do Next
                        </p>
                        <ol className="mt-2 space-y-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                          {nextSteps.map((step, index) => (
                            <li key={`${req.id}-inbox-step-${index}`}>
                              <span className="mr-2 font-semibold" style={{ color: "#93c5fd" }}>
                                {index + 1}.
                              </span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Action Required Tasks */}
      {tasks.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text)" }}>Action Required</h2>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border p-4"
                style={{
                  borderColor: "rgba(146,64,14,0.45)",
                  background: "rgba(120,53,15,0.14)",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium" style={{ color: "#fdba74" }}>{task.title}</h3>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="text-sm whitespace-pre-line" style={{ color: "var(--text-muted)" }}>
                      {task.instructions.split("\n\nBroker message excerpt:")[0]}
                    </p>
                    {task.dueAt && (
                      <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
                        Due: {new Date(task.dueAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {task.actionUrl && (
                      <a
                        href={task.actionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded px-3 py-1.5 text-center text-xs font-medium text-white transition-colors"
                        style={{ background: "#ea580c" }}
                      >
                        Open link
                      </a>
                    )}
                    <button
                        onClick={() => handleTaskAction(task.id, "completed")}
                        disabled={!!actionLoading}
                        className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors"
                        style={{ background: "rgba(6,95,70,0.35)", color: "#86efac" }}
                      >
                        {actionLoading === `task-${task.id}` ? "..." : "Done"}
                      </button>
                    <button
                        onClick={() => handleTaskAction(task.id, "dismissed")}
                        disabled={!!actionLoading}
                        className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors"
                        style={{
                          background: "var(--bg-subtle)",
                          color: "var(--text-faint)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        Dismiss
                      </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Broker Requests Table */}
      {requests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text)" }}>Broker Requests</h2>
          <div className="rounded-lg overflow-x-auto border" style={{ borderColor: "var(--border)" }}>
            <table className="min-w-full text-sm">
              <thead style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Broker</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Method</th>
                  <th className="text-left px-4 py-3 font-medium">Delivery</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">SLA</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">History</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: "1px solid var(--border)" }}>
                {requests.map((req) => {
                  const delivery = getDeliveryView(req);
                  const isOpen = openTimeline === req.id;
                  const panelId = `timeline-${req.id}`;

                  return (
                    <Fragment key={req.id}>
                      <tr
                        key={req.id}
                        className="align-top"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium" style={{ color: "var(--text)" }}>{req.broker.name}</div>
                          <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{req.broker.domain}</div>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                          {req.broker.category.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{req.method.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <div className="min-w-[18rem]">
                            <p className="font-medium" style={{ color: delivery.titleColor }}>
                              {delivery.title}
                            </p>
                            <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{delivery.detail}</p>
                            {delivery.failure && (
                              <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>
                                Last failure: {delivery.failure}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.status} />
                        </td>
                        <td className="px-4 py-3">
                          <SLACountdown deadline={req.deadline} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-[14rem] flex-col gap-2">
                            {(req.status === "requires_user_action" || req.method === "manual_link") &&
                              req.removalUrl && (
                                <a
                                  href={req.removalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-red-400 hover:text-red-300 underline text-xs"
                                >
                                  {isManualFallback(req)
                                    ? "Open broker opt-out page →"
                                    : "Open opt-out link →"}
                                </a>
                              )}
                            {isManualFallback(req) ? (
                              <p className="text-xs text-orange-300">
                                Next: open the broker page, complete their opt-out flow,
                                and then check back here for any follow-up tasks.
                              </p>
                            ) : shouldMonitorPersonalInbox(req) ? (
                              <p className="text-xs text-blue-200">
                                Watch {req.replyToAddress} for replies or verification
                                steps from {getBrokerReplyHint(req)}.
                              </p>
                            ) : req.sentAt ? (
                              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                                No action needed unless the broker asks for more information.
                              </p>
                            ) : req.method === "manual_link" ? (
                              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                                Use the direct broker link to complete this opt-out.
                              </p>
                            ) : (
                              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                                Delivery is being tracked automatically.
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => handleToggleTimeline(req.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
                          >
                            <span>{isOpen ? "Hide" : "Show"} timeline</span>
                            <span aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${req.id}-timeline`}>
                          <td colSpan={8} className="px-0 py-0">
                            <div
                              id={panelId}
                              className="px-6 py-5 border-t"
                              style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
                            >
                              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-2)" }}>
                                Communication timeline — {req.broker.name}
                              </h3>
                              <TimelinePanel
                                requestId={req.id}
                                events={timelineData[req.id] ?? null}
                                loading={timelineLoading === req.id}
                                error={timelineError[req.id] ?? null}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Custom Requests */}
      <section>
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text)" }}>Custom Removal Request</h2>
        <form onSubmit={handleCustomRequest} className="flex gap-3 mb-4">
          <input
            type="url"
            placeholder="https://example.com/your-listing"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            required
            className="flex-1 px-4 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            type="submit"
            disabled={!!actionLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors border"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            {actionLoading === "custom" ? "Adding…" : "Add Request"}
          </button>
        </form>

        {customRequests.length > 0 && (
          <div className="space-y-2">
            {customRequests.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center justify-between rounded-lg px-4 py-3 text-sm border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="truncate flex-1 mr-4">{cr.targetUrl}</div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={cr.status} />
                  {cr.removalUrl && (
                    <a
                      href={cr.removalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 hover:text-red-300 underline text-xs"
                    >
                      Remove →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Empty state */}
      {!summary || summary.total === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--text-faint)" }}>
          <p className="text-lg">No removal requests yet.</p>
          <p className="text-sm mt-2">
            Run a scan to discover exposed data, then submit a removal request.
          </p>
        </div>
      ) : null}
      </PageContent>
  );
}

// ── Timeline panel ────────────────────────────────────────────────────────────

function TimelinePanel({
  events,
  loading,
  error,
}: {
  requestId: string;
  events: TimelineEvent[] | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return <p className="text-sm" style={{ color: "var(--text-faint)" }}>Loading timeline…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!events || events.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-faint)" }}>
        No communication events recorded yet beyond the initial submission.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0" style={{ borderLeft: "1px solid var(--border-2)" }}>
      {events.map((event, index) => (
        <li key={event.id} className="ml-4 pb-6 last:pb-0">
          <span
            className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2"
            style={toneDotStyle(event.tone)}
            aria-hidden="true"
          />
          <div className="pl-2">
            <p className="text-xs mb-0.5" style={{ color: "var(--text-faint)" }}>
              {formatDateTime(event.occurredAt)}
            </p>
            <p className="text-sm font-semibold" style={{ color: toneTitleColor(event.tone) }}>
              {event.title}
            </p>
            <p className="text-sm mt-0.5 leading-5" style={{ color: "var(--text-muted)" }}>
              {event.description}
            </p>
            <TimelineEventMeta event={event} />
          </div>
          {index === events.length - 1 && null}
        </li>
      ))}
    </ol>
  );
}

function TimelineEventMeta({ event }: { event: TimelineEvent }) {
  const m = event.metadata;
  if (!m) return null;

  const chips: { label: string; value: string }[] = [];

  if (m.classification && m.classification !== "unknown") {
    const label = classificationLabel(m.classification);
    const conf = m.classificationConfidence != null ? ` (${m.classificationConfidence}% confidence)` : "";
    chips.push({ label: "Classification", value: `${label}${conf}` });
  }
  if (m.actionType) {
    chips.push({ label: "Action type", value: m.actionType.replace(/_/g, " ") });
  }
  if (m.replyToAddress) {
    chips.push({ label: "Reply inbox", value: m.replyToAddress });
  }
  if (m.failureReason) {
    chips.push({ label: "Failure", value: trimMessage(m.failureReason, 120) });
  }
  if (m.providerMessageId) {
    chips.push({ label: "Provider ID", value: shortId(m.providerMessageId) });
  }
  if (m.actionUrl) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={m.actionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-red-400 hover:text-red-300 underline"
        >
          Open required link →
        </a>
        {chips.map((chip) => (
          <MetaChip key={chip.label} label={chip.label} value={chip.value} />
        ))}
      </div>
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <MetaChip key={chip.label} label={chip.label} value={chip.value} />
      ))}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs border"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
    >
      <span style={{ color: "var(--text-faint)" }}>{label}:</span> {value}
    </span>
  );
}

function toneDotStyle(tone: TimelineTone): { borderColor: string; background: string } {
  switch (tone) {
    case "success":
      return { borderColor: "#22c55e", background: "rgba(22,101,52,0.45)" };
    case "warning":
      return { borderColor: "#f97316", background: "rgba(154,52,18,0.4)" };
    case "danger":
      return { borderColor: "#ef4444", background: "rgba(153,27,27,0.4)" };
    case "info":
      return { borderColor: "#3b82f6", background: "rgba(30,64,175,0.35)" };
    default:
      return { borderColor: "var(--border-2)", background: "var(--surface-2)" };
  }
}

function toneTitleColor(tone: TimelineTone): string {
  switch (tone) {
    case "success":
      return "#86efac";
    case "warning":
      return "#fdba74";
    case "danger":
      return "#fca5a5";
    case "info":
      return "#93c5fd";
    default:
      return "var(--text-2)";
  }
}

function classificationLabel(classification: string): string {
  const map: Record<string, string> = {
    completion: "Completed",
    acknowledgment: "Acknowledged",
    rejection: "Rejected",
    needs_more_info: "Needs more info",
    noise: "Auto-reply / noise",
  };
  return map[classification] ?? classification.replace(/_/g, " ");
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function isManualFallback(req: RemovalRequest) {
  return req.method === "manual_link" && Boolean(req.lastError);
}

function shouldMonitorPersonalInbox(req: RemovalRequest) {
  return (
    req.method === "email" &&
    Boolean(req.sentAt) &&
    Boolean(req.replyToAddress) &&
    !["completed", "rejected"].includes(req.status)
  );
}

function getManualFallbackSummary(req: RemovalRequest) {
  const attemptedAt = req.lastAttemptAt ?? req.sentAt ?? req.submittedAt;
  if (attemptedAt) {
    return `Automatic email delivery failed on ${formatDateTime(
      attemptedAt
    )}, so this request has been switched to a manual broker opt-out.`;
  }

  return "Automatic email delivery failed, so this request has been switched to a manual broker opt-out.";
}

function getManualFallbackWhatHappened(req: RemovalRequest) {
  const attemptedAt = req.lastAttemptAt ?? req.sentAt ?? req.submittedAt;
  if (attemptedAt) {
    return `We tried to contact ${req.broker.name} automatically on ${formatDateTime(
      attemptedAt
    )}, but the broker email could not be delivered. Instead of leaving the request stuck, NUKE generated a direct fallback path for you.`;
  }

  return `We tried to contact ${req.broker.name} automatically, but the broker email could not be delivered. Instead of leaving the request stuck, NUKE generated a direct fallback path for you.`;
}

function getManualFallbackSteps(req: RemovalRequest) {
  if (req.removalUrl) {
    return [
      "Open the broker opt-out page using the link above.",
      "Complete the broker's own removal or suppression form using the matching profile information they already show.",
      "Return to this dashboard later to see whether any new tasks or broker responses appear.",
    ];
  }

  return [
    "Refresh the dashboard to see whether the fallback link is available.",
    "Once the broker link appears, complete the broker's own opt-out flow directly.",
    "Check back here afterward for any new follow-up tasks.",
  ];
}

function getPersonalInboxSteps(req: RemovalRequest) {
  return [
    `Check ${req.replyToAddress} and its spam folder for messages from ${getBrokerReplyHint(
      req
    )}.`,
    "Complete any identity check, confirmation link, or reply step the broker requests.",
    "Return to this dashboard afterward so you can track any status changes or follow-up tasks.",
  ];
}

function getDeliveryView(req: RemovalRequest): {
  title: string;
  detail: string;
  failure: string | null;
  titleColor: string;
} {
  if (req.lastError) {
    const attemptedAt = req.lastAttemptAt ?? req.sentAt ?? req.submittedAt;

    if (isManualFallback(req)) {
      return {
        title: "Email failed, manual fallback ready",
        detail: attemptedAt
          ? `Last delivery attempt ran on ${formatDateTime(attemptedAt)}. A manual broker link is ready instead.`
          : "Email delivery failed and the request fell back to a manual broker link.",
        failure: trimMessage(req.lastError),
        titleColor: "#fdba74",
      };
    }

    return {
      title: "Delivery issue detected",
      detail: attemptedAt
        ? `The last delivery attempt was recorded on ${formatDateTime(attemptedAt)}.`
        : "A broker delivery attempt failed and may need another retry.",
      failure: trimMessage(req.lastError),
      titleColor: "#fca5a5",
    };
  }

  if (req.sentAt) {
    return {
      title: "Broker email sent",
      detail: req.providerMessageId
        ? `Sent ${formatDateTime(req.sentAt)}. Provider id: ${shortId(req.providerMessageId)}`
        : `Sent ${formatDateTime(req.sentAt)}.`,
      failure: null,
      titleColor: "#93c5fd",
    };
  }

  if (req.method === "manual_link") {
    return {
      title: "Manual link generated",
      detail: "This broker currently relies on a direct manual opt-out link instead of outbound email.",
      failure: null,
      titleColor: "#fdba74",
    };
  }

  if (req.method === "form") {
    return {
      title: "Form automation path",
      detail: "This broker is tracked as a form-based workflow rather than an email send.",
      failure: null,
      titleColor: "var(--text-muted)",
    };
  }

  if (req.method === "api") {
    return {
      title: "API workflow path",
      detail: "This broker is tracked as an API-based workflow rather than an email send.",
      failure: null,
      titleColor: "var(--text-muted)",
    };
  }

  return {
    title: "Waiting to send",
    detail: req.attemptCount > 0
      ? "A previous send attempt was recorded, but the request is still waiting on delivery."
      : "This broker email is queued but has not been sent yet.",
    failure: null,
    titleColor: "var(--text-muted)",
  };
}

function trimMessage(value: string, maxLength = 160) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function shortId(value: string, maxLength = 20) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function getBrokerReplyHint(req: RemovalRequest) {
  const endpoint = req.broker.removalEndpoint?.trim();
  if (!endpoint) {
    return req.broker.domain;
  }

  if (!endpoint.includes("@")) {
    return req.broker.domain;
  }

  const endpointDomain = endpoint.split("@")[1]?.toLowerCase();
  const brokerDomain = req.broker.domain.toLowerCase();
  if (!endpointDomain || endpointDomain === brokerDomain) {
    return endpoint;
  }

  return `${endpoint} or ${req.broker.domain}`;
}
