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
  const deliveryIssueCount = requests.filter(
    (req) => Boolean(req.lastError) && !isFormActionRequired(req)
  ).length;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div
            className="w-full max-w-lg border p-5"
            style={{
              borderColor: "var(--border-2)",
              borderLeft: "4px solid var(--status-warning)",
              background: "var(--surface)",
            }}
          >
            <div className="space-y-4">
              <h2 className="m-0">A removal request was already sent</h2>

              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                A pending removal workflow was submitted at{" "}
                <span className="font-semibold" style={{ color: "var(--text)" }}>
                  {formatDateTime(latestSubmittedAt)}
                </span>
                . Sending another batch right now is not advised because it can
                spam brokers and make the results less effective.
              </p>

              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                In the future we plan to block repeat submissions entirely for
                active requests. If you still want to force another round, you
                can continue below.
              </p>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowResubmitConfirm(false)}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 border text-sm disabled:opacity-50"
                  style={{
                    borderColor: "var(--border-2)",
                    background: "var(--bg-subtle)",
                    color: "var(--text-2)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResubmit}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 border text-sm text-white disabled:opacity-50"
                  style={{ background: "var(--accent)", borderColor: "var(--accent)" }}
                >
                  {actionLoading === "remove" ? "Resubmitting…" : "Resubmit anyway"}
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
              className="px-3 py-1.5 text-sm font-medium border disabled:opacity-50"
              style={{ background: "var(--bg-subtle)", borderColor: "var(--border-2)", color: "var(--text-2)" }}
            >
              {actionLoading === "scan" ? "Scanning…" : "Run scan"}
            </button>
            <button
              onClick={handleSubmitRemoval}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-sm font-medium border text-white disabled:opacity-50"
              style={{ background: "var(--accent)", borderColor: "var(--accent)" }}
            >
              {actionLoading === "remove" ? "Submitting…" : "Submit removal"}
            </button>
          </>
        }
      />

      {error && <Banner tone="error">{error}</Banner>}

      {summary && summary.total > 0 && (
        <section>
          <h2>Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            <StatCard label="Total requests" value={summary.total} />
            <StatCard label="Completed" value={summary.completed} />
            <StatCard label="Pending action" value={summary.requiresUserAction} />
            <StatCard label="Overdue" value={summary.overdue} accent={summary.overdue > 0} />
          </div>
        </section>
      )}

      {requests.length > 0 && (
        <section>
          <h2>Delivery visibility</h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <StatCard label="Broker emails sent" value={emailedCount} />
            <StatCard label="Delivery issues" value={deliveryIssueCount} accent={deliveryIssueCount > 0} />
            <StatCard label="Manual fallbacks" value={manualFallbackCount} accent={manualFallbackCount > 0} />
          </div>
        </section>
      )}

      {manualFallbackRequests.length > 0 && (
        <section>
          <h2>Manual follow-up needed</h2>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            We tried the email route for these brokers and it failed. Each one has been
            switched to a direct broker opt-out link so you can finish the request
            yourself.{" "}
            <span className="status-text status-warning">
              {manualFallbackRequests.length} broker
              {manualFallbackRequests.length === 1 ? "" : "s"} affected.
            </span>
          </p>

          <ul className="mt-4 space-y-5 list-none p-0">
            {manualFallbackRequests.map((req) => {
              const nextSteps = getManualFallbackSteps(req);

              return (
                <li
                  key={`fallback-${req.id}`}
                  className="border-l-2 pl-4"
                  style={{ borderColor: "var(--status-warning)" }}
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="m-0">{req.broker.name}</h3>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                        {getManualFallbackSummary(req)}
                      </p>
                    </div>
                    {req.removalUrl && (
                      <a
                        href={req.removalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium"
                        style={{ color: "var(--link)" }}
                      >
                        Open broker opt-out page →
                      </a>
                    )}
                  </div>

                  <div className="mt-3">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      What happened
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                      {getManualFallbackWhatHappened(req)}
                    </p>
                    {req.lastError && (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: "var(--status-danger)" }}
                      >
                        Last failure: {trimMessage(req.lastError, 220)}
                      </p>
                    )}
                  </div>

                  <div className="mt-3">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      What to do next
                    </p>
                    <ol
                      className="mt-1 ml-5 list-decimal text-sm"
                      style={{ color: "var(--text-2)" }}
                    >
                      {nextSteps.map((step, index) => (
                        <li key={`${req.id}-step-${index}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {inboxWatchRequests.length > 0 && (
        <section>
          <h2>Check your personal inbox</h2>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            These broker emails were sent with your personal profile address as the
            reply target, so identity checks, confirmation links, and completion notices
            can arrive there instead of inside the app.
          </p>
          {inboxWatchAddresses.length > 0 && (
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
              Watch{" "}
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {inboxWatchAddresses.join(", ")}
              </span>{" "}
              for broker replies.
            </p>
          )}
          {loginDiffersFromReplyInbox && user?.email && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Your NUKE login email is {user.email}, which is different from the inbox
              brokers may be using for follow-up.
            </p>
          )}

          <ul className="mt-4 space-y-5 list-none p-0">
            {inboxWatchRequests.map((req) => {
              const nextSteps = getPersonalInboxSteps(req);

              return (
                <li
                  key={`inbox-watch-${req.id}`}
                  className="border-l-2 pl-4"
                  style={{ borderColor: "var(--status-active)" }}
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0">{req.broker.name}</h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                        {req.sentAt
                          ? `Broker email sent ${formatDateTime(req.sentAt)}.`
                          : "Broker email delivery is in progress."}{" "}
                        Replies may go to{" "}
                        <span className="font-semibold" style={{ color: "var(--text)" }}>
                          {req.replyToAddress}
                        </span>
                        .
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Watch for mail from {getBrokerReplyHint(req)}
                    </p>
                  </div>

                  <div className="mt-3">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Why this matters
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                      If {req.broker.name} asks for identity verification or sends a
                      confirmation link to your personal inbox, NUKE will not know about
                      that action until you complete it or route the reply back into the
                      app later.
                    </p>
                  </div>

                  <div className="mt-3">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      What to do next
                    </p>
                    <ol
                      className="mt-1 ml-5 list-decimal text-sm"
                      style={{ color: "var(--text-2)" }}
                    >
                      {nextSteps.map((step, index) => (
                        <li key={`${req.id}-inbox-step-${index}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Action Required Tasks */}
      {tasks.length > 0 && (
        <section>
          <h2>Action required</h2>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {tasks.length} task{tasks.length === 1 ? "" : "s"} need{tasks.length === 1 ? "s" : ""} your attention.
          </p>
          <ul className="mt-4 space-y-4 list-none p-0">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="border-l-2 pl-4"
                style={{ borderColor: "var(--status-warning)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0">{task.title}</h3>
                      <StatusBadge status={task.status} />
                    </div>
                    <p
                      className="mt-1 text-sm whitespace-pre-line"
                      style={{ color: "var(--text-2)" }}
                    >
                      {task.instructions.split("\n\nBroker message excerpt:")[0]}
                    </p>
                    {task.dueAt && (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Due: {new Date(task.dueAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 items-end">
                    {task.actionUrl && (
                      <a
                        href={task.actionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs"
                        style={{ color: "var(--link)" }}
                      >
                        Open link →
                      </a>
                    )}
                    <button
                      onClick={() => handleTaskAction(task.id, "completed")}
                      disabled={!!actionLoading}
                      className="text-xs underline disabled:opacity-50"
                      style={{ color: "var(--status-success)" }}
                    >
                      {actionLoading === `task-${task.id}` ? "…" : "Mark done"}
                    </button>
                    <button
                      onClick={() => handleTaskAction(task.id, "dismissed")}
                      disabled={!!actionLoading}
                      className="text-xs underline disabled:opacity-50"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {requests.length > 0 && (
        <section>
          <h2>Broker requests</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th>Broker</th>
                  <th>Category</th>
                  <th>Method</th>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Action</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const delivery = getDeliveryView(req);
                  const isOpen = openTimeline === req.id;
                  const panelId = `timeline-${req.id}`;

                  return (
                    <Fragment key={req.id}>
                      <tr key={req.id}>
                        <td>
                          <div className="font-semibold" style={{ color: "var(--text)" }}>
                            {req.broker.name}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {req.broker.domain}
                          </div>
                        </td>
                        <td style={{ color: "var(--text-2)" }}>
                          {req.broker.category.replace(/_/g, " ")}
                        </td>
                        <td style={{ color: "var(--text-2)" }}>
                          {req.method.replace(/_/g, " ")}
                        </td>
                        <td>
                          <div className="min-w-[16rem]">
                            <p className="font-medium" style={{ color: delivery.titleColor }}>
                              {delivery.title}
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {delivery.detail}
                            </p>
                            {delivery.failure && (
                              <p
                                className="mt-1 text-xs"
                                style={{ color: "var(--status-danger)" }}
                              >
                                Last failure: {delivery.failure}
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={req.status} />
                        </td>
                        <td>
                          <SLACountdown deadline={req.deadline} />
                        </td>
                        <td>
                          <div className="flex min-w-[14rem] flex-col gap-1">
                            {(req.status === "requires_user_action" || req.method === "manual_link") &&
                              req.removalUrl && (
                                <a
                                  href={req.removalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs"
                                  style={{ color: "var(--link)" }}
                                >
                                  {isFormActionRequired(req)
                                    ? getFormActionLinkLabel(req)
                                    : isManualFallback(req)
                                      ? "Open broker opt-out page →"
                                      : "Open opt-out link →"}
                                </a>
                              )}
                            {isManualFallback(req) ? (
                              <p
                                className="text-xs"
                                style={{ color: "var(--status-warning)" }}
                              >
                                Next: open the broker page, complete their opt-out flow,
                                and then check back here for any follow-up tasks.
                              </p>
                            ) : isFormActionRequired(req) ? (
                              <p
                                className="text-xs"
                                style={{ color: "var(--status-active)" }}
                              >
                                {getFormActionHelpText(req)}
                              </p>
                            ) : shouldMonitorPersonalInbox(req) ? (
                              <p
                                className="text-xs"
                                style={{ color: "var(--status-active)" }}
                              >
                                Watch {req.replyToAddress} for replies or verification
                                steps from {getBrokerReplyHint(req)}.
                              </p>
                            ) : req.sentAt ? (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                No action needed unless the broker asks for more information.
                              </p>
                            ) : req.method === "manual_link" ? (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                Use the direct broker link to complete this opt-out.
                              </p>
                            ) : (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                Delivery is being tracked automatically.
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            onClick={() => handleToggleTimeline(req.id)}
                            className="text-xs underline"
                            style={{ color: "var(--link)" }}
                          >
                            {isOpen ? "Hide" : "Show"} timeline
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${req.id}-timeline`}>
                          <td colSpan={8} style={{ background: "var(--bg-subtle)" }}>
                            <div id={panelId} className="px-2 py-3">
                              <h3 className="m-0 text-sm font-semibold">
                                Communication timeline — {req.broker.name}
                              </h3>
                              <div className="mt-2">
                                <TimelinePanel
                                  requestId={req.id}
                                  events={timelineData[req.id] ?? null}
                                  loading={timelineLoading === req.id}
                                  error={timelineError[req.id] ?? null}
                                />
                              </div>
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

      <section>
        <h2>Custom removal request</h2>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Found a page with your data that isn&apos;t in the broker registry? Paste the
          URL and we&apos;ll add it to your queue.
        </p>
        <form onSubmit={handleCustomRequest} className="mt-3 flex gap-2">
          <input
            type="url"
            placeholder="https://example.com/your-listing"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            required
            className="flex-1 px-3 py-1.5 text-sm border"
            style={{
              background: "var(--bg)",
              borderColor: "var(--border-2)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={!!actionLoading}
            className="px-3 py-1.5 text-sm font-medium border disabled:opacity-50"
            style={{
              background: "var(--bg-subtle)",
              borderColor: "var(--border-2)",
              color: "var(--text-2)",
            }}
          >
            {actionLoading === "custom" ? "Adding…" : "Add request"}
          </button>
        </form>

        {customRequests.length > 0 && (
          <ul className="mt-4 space-y-2 list-none p-0">
            {customRequests.map((cr) => (
              <li
                key={cr.id}
                className="flex items-center justify-between gap-3 text-sm py-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="truncate flex-1" style={{ color: "var(--text-2)" }}>
                  {cr.targetUrl}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={cr.status} />
                  {cr.removalUrl && (
                    <a
                      href={cr.removalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs"
                      style={{ color: "var(--link)" }}
                    >
                      Remove →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
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
  if (m.evidenceRunId) {
    chips.push({ label: "Run", value: shortId(m.evidenceRunId) });
  }
  if (m.evidenceRunStatus) {
    chips.push({ label: "Run status", value: m.evidenceRunStatus.replace(/_/g, " ") });
  }
  if (m.blockerType) {
    chips.push({ label: "Blocker", value: m.blockerType.replace(/_/g, " ") });
  }
  if (m.screenshotCount != null) {
    chips.push({ label: "Screenshots", value: String(m.screenshotCount) });
  }
  if (m.runDir) {
    chips.push({ label: "Artifacts", value: trimMessage(m.runDir, 80) });
  }
  if (m.logPath) {
    chips.push({ label: "Log", value: trimMessage(m.logPath, 80) });
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
      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs border"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}
    >
      <span style={{ color: "var(--text-faint)" }}>{label}:</span> {value}
    </span>
  );
}

function toneDotStyle(tone: TimelineTone): { borderColor: string; background: string } {
  switch (tone) {
    case "success":
      return { borderColor: "var(--status-success)", background: "var(--surface)" };
    case "warning":
      return { borderColor: "var(--status-warning)", background: "var(--surface)" };
    case "danger":
      return { borderColor: "var(--status-danger)", background: "var(--surface)" };
    case "info":
      return { borderColor: "var(--status-active)", background: "var(--surface)" };
    default:
      return { borderColor: "var(--border-2)", background: "var(--surface-2)" };
  }
}

function toneTitleColor(tone: TimelineTone): string {
  switch (tone) {
    case "success":
      return "var(--status-success)";
    case "warning":
      return "var(--status-warning)";
    case "danger":
      return "var(--status-danger)";
    case "info":
      return "var(--status-active)";
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

function isFormActionRequired(req: RemovalRequest) {
  return req.method === "form" && req.status === "requires_user_action";
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
  if (isFormActionRequired(req)) {
    const attemptedAt = req.lastAttemptAt ?? req.submittedAt;
    return {
      title: getFormActionTitle(req),
      detail: getFormActionDetail(req, attemptedAt),
      failure: req.lastError ? trimMessage(req.lastError) : null,
      titleColor: "var(--status-active)",
    };
  }

  if (req.lastError) {
    const attemptedAt = req.lastAttemptAt ?? req.sentAt ?? req.submittedAt;

    if (isManualFallback(req)) {
      return {
        title: "Email failed, manual fallback ready",
        detail: attemptedAt
          ? `Last delivery attempt ran on ${formatDateTime(attemptedAt)}. A manual broker link is ready instead.`
          : "Email delivery failed and the request fell back to a manual broker link.",
        failure: trimMessage(req.lastError),
        titleColor: "var(--status-warning)",
      };
    }

    return {
      title: "Delivery issue detected",
      detail: attemptedAt
        ? `The last delivery attempt was recorded on ${formatDateTime(attemptedAt)}.`
        : "A broker delivery attempt failed and may need another retry.",
      failure: trimMessage(req.lastError),
      titleColor: "var(--status-danger)",
    };
  }

  if (req.sentAt) {
    return {
      title: "Broker email sent",
      detail: req.providerMessageId
        ? `Sent ${formatDateTime(req.sentAt)}. Provider id: ${shortId(req.providerMessageId)}`
        : `Sent ${formatDateTime(req.sentAt)}.`,
      failure: null,
      titleColor: "var(--status-active)",
    };
  }

  if (req.method === "form" && req.status === "submitted" && req.submittedAt) {
    return {
      title: "Broker form submitted",
      detail: `Form workflow ran on ${formatDateTime(req.submittedAt)}.`,
      failure: null,
      titleColor: "var(--status-active)",
    };
  }

  if (req.method === "manual_link") {
    return {
      title: "Manual link generated",
      detail: "This broker currently relies on a direct manual opt-out link instead of outbound email.",
      failure: null,
      titleColor: "var(--status-warning)",
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

function getFormActionTitle(req: RemovalRequest) {
  const reason = req.lastError?.toLowerCase() ?? "";

  if (reason.includes("verification form")) {
    return "Verification form needs your help";
  }
  if (reason.includes("captcha")) {
    return "CAPTCHA blocking broker step";
  }
  if (reason.includes("bot-check") || reason.includes("bot check")) {
    return "Broker bot-check blocked automation";
  }
  if (reason.includes("could not confidently match")) {
    return "Profile match still needs review";
  }
  if (reason.includes("confirmation state")) {
    return "Submission needs review";
  }

  return "Form needs a final manual step";
}

function getFormActionDetail(req: RemovalRequest, attemptedAt: string | null) {
  const when = attemptedAt ? ` on ${formatDateTime(attemptedAt)}` : "";
  const reason = req.lastError?.toLowerCase() ?? "";

  if (reason.includes("verification form")) {
    return `NUKE reached ${req.broker.name}${when} and filled the initial verification form, but you still need to complete the broker's CAPTCHA step so it can send the removal link by email.`;
  }
  if (reason.includes("captcha")) {
    return `NUKE reached ${req.broker.name}${when} and prefilled the broker form, but the final submit is gated behind a live CAPTCHA.`;
  }
  if (reason.includes("bot-check") || reason.includes("bot check")) {
    return `${req.broker.name} redirected the automation to a live bot-check${when}, so NUKE stopped instead of forcing the flow.`;
  }
  if (reason.includes("could not confidently match")) {
    return `NUKE searched ${req.broker.name}${when}, but it could not safely choose the right listing from the available matches.`;
  }
  if (reason.includes("confirmation state")) {
    return `NUKE filled the ${req.broker.name} form${when}, but the page did not return a clear enough success state to trust automatically.`;
  }

  return attemptedAt
    ? `Automation reached the broker workflow on ${formatDateTime(
        attemptedAt
      )}, but the remaining challenge or confirmation step still needs you.`
    : "Automation reached the broker workflow, but the remaining challenge or confirmation step still needs you.";
}

function getFormActionLinkLabel(req: RemovalRequest) {
  const reason = req.lastError?.toLowerCase() ?? "";

  if (reason.includes("verification form")) {
    return "Open verification form →";
  }
  if (reason.includes("captcha")) {
    return "Open prefilled opt-out page →";
  }
  if (reason.includes("bot-check") || reason.includes("bot check")) {
    return "Open broker challenge page →";
  }
  if (reason.includes("could not confidently match")) {
    return "Review broker search results →";
  }

  return "Finish broker form →";
}

function getFormActionHelpText(req: RemovalRequest) {
  const reason = req.lastError?.toLowerCase() ?? "";

  if (reason.includes("verification form")) {
    return "Open the broker form, confirm your name and email, complete the CAPTCHA, submit it, and then watch for the broker's removal-link email.";
  }
  if (reason.includes("captcha")) {
    return "NUKE reached the broker’s prefilled opt-out page, but you still need to solve the live CAPTCHA before the broker will accept it.";
  }
  if (reason.includes("bot-check") || reason.includes("bot check")) {
    return "The broker presented a bot-check, so NUKE stopped and handed the page back to you instead of risking a brittle automation failure.";
  }
  if (reason.includes("could not confidently match")) {
    return "NUKE found likely matching listings, but it would rather ask you to pick the right one than submit against the wrong person.";
  }

  return "NUKE reached the broker workflow, but you still need to finish a challenge or confirmation step on the broker page.";
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
