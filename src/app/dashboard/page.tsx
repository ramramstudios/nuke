"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { SLACountdown } from "@/components/SLACountdown";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";

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
  broker: { name: string; domain: string; category: string };
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

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  const latestSubmittedAt = requests
    .map((req) => req.submittedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const emailedCount = requests.filter((req) => Boolean(req.sentAt)).length;
  const deliveryIssueCount = requests.filter((req) => Boolean(req.lastError)).length;
  const manualFallbackRequests = requests.filter((req) => isManualFallback(req));
  const manualFallbackCount = manualFallbackRequests.length;

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-8">
      {showResubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-lg rounded-2xl border border-orange-900/60 bg-gray-950 p-6 shadow-2xl">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">
                  Resubmit Warning
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  A removal request was already sent
                </h2>
              </div>

              <p className="text-sm leading-6 text-gray-300">
                We already have a pending removal workflow that was submitted at{" "}
                <span className="font-medium text-white">
                  {formatDateTime(latestSubmittedAt)}
                </span>
                . Sending another batch right now is not advised because it can
                spam brokers and make the results less effective.
              </p>

              <p className="text-sm leading-6 text-gray-400">
                In the future we plan to block repeat submissions entirely for
                active requests. If you still want to force another round, you
                can continue below.
              </p>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowResubmitConfirm(false)}
                  disabled={!!actionLoading}
                  className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResubmit}
                  disabled={!!actionLoading}
                  className="px-4 py-2 rounded-lg bg-orange-600 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
                >
                  {actionLoading === "remove" ? "Resubmitting…" : "Resubmit Anyway"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/scans"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            View Scan Results
          </Link>
          <button
            onClick={handleScan}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "scan" ? "Scanning…" : "Run Scan"}
          </button>
          <button
            onClick={handleSubmitRemoval}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "remove" ? "Submitting…" : "Submit Removal"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card label="Total Requests" value={summary.total} />
          <Card label="Completed" value={summary.completed} color="text-green-400" />
          <Card label="Pending Action" value={summary.requiresUserAction} color="text-orange-400" />
          <Card label="Overdue" value={summary.overdue} color="text-red-400" />
        </div>
      )}

      {requests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Delivery Visibility</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card label="Broker Emails Sent" value={emailedCount} color="text-blue-300" />
            <Card label="Delivery Issues" value={deliveryIssueCount} color="text-red-400" />
            <Card label="Manual Fallbacks" value={manualFallbackCount} color="text-orange-400" />
          </div>
        </section>
      )}

      {manualFallbackRequests.length > 0 && (
        <section>
          <div className="rounded-2xl border border-orange-900/60 bg-orange-950/30 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">
                  Manual Follow-Up Needed
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  Some brokers could not be contacted automatically
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-100/80">
                  We already tried the email route for these brokers and it failed.
                  We have switched each one to a direct broker opt-out link so you can
                  finish the request yourself without leaving the dashboard guessing what
                  happened next.
                </p>
              </div>
              <div className="rounded-xl border border-orange-900/60 bg-black/20 px-4 py-3 text-sm text-orange-100">
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
                    className="rounded-xl border border-orange-900/50 bg-black/20 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-white">
                          {req.broker.name}
                        </h3>
                        <p className="mt-1 text-sm text-orange-100/80">
                          {getManualFallbackSummary(req)}
                        </p>
                      </div>
                      {req.removalUrl && (
                        <a
                          href={req.removalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                        >
                          Open broker opt-out page
                        </a>
                      )}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-orange-900/40 bg-orange-950/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">
                          What Happened
                        </p>
                        <p className="mt-2 text-sm leading-6 text-gray-200">
                          {getManualFallbackWhatHappened(req)}
                        </p>
                        {req.lastError && (
                          <p className="mt-3 text-xs leading-5 text-red-300">
                            Last failure: {trimMessage(req.lastError, 220)}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-orange-900/40 bg-orange-950/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">
                          What To Do Next
                        </p>
                        <ol className="mt-2 space-y-2 text-sm leading-6 text-gray-200">
                          {nextSteps.map((step, index) => (
                            <li key={`${req.id}-step-${index}`}>
                              <span className="mr-2 font-semibold text-orange-300">
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
          <h2 className="text-xl font-semibold mb-4">Action Required</h2>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="bg-orange-950/30 border border-orange-900/50 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-orange-200">{task.title}</h3>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-line">
                      {task.instructions.split("\n\nBroker message excerpt:")[0]}
                    </p>
                    {task.dueAt && (
                      <p className="text-xs text-gray-500 mt-2">
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
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-medium text-center transition-colors"
                      >
                        Open link
                      </a>
                    )}
                    <button
                      onClick={() => handleTaskAction(task.id, "completed")}
                      disabled={!!actionLoading}
                      className="px-3 py-1.5 bg-green-800 hover:bg-green-700 text-green-200 rounded text-xs font-medium disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === `task-${task.id}` ? "..." : "Done"}
                    </button>
                    <button
                      onClick={() => handleTaskAction(task.id, "dismissed")}
                      disabled={!!actionLoading}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded text-xs font-medium disabled:opacity-50 transition-colors"
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
          <h2 className="text-xl font-semibold mb-4">Broker Requests</h2>
          <div className="border border-gray-800 rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Broker</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Method</th>
                  <th className="text-left px-4 py-3 font-medium">Delivery</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">SLA</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {requests.map((req) => {
                  const delivery = getDeliveryView(req);

                  return (
                    <tr key={req.id} className="hover:bg-gray-900/50 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium">{req.broker.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{req.broker.domain}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {req.broker.category.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{req.method.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">
                        <div className="min-w-[18rem]">
                          <p className={`font-medium ${delivery.titleClassName}`}>
                            {delivery.title}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">{delivery.detail}</p>
                          {delivery.failure && (
                            <p className="mt-2 text-xs text-red-300">
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
                          ) : req.sentAt ? (
                            <p className="text-xs text-gray-500">
                              No action needed unless the broker asks for more information.
                            </p>
                          ) : req.method === "manual_link" ? (
                            <p className="text-xs text-gray-500">
                              Use the direct broker link to complete this opt-out.
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500">
                              Delivery is being tracked automatically.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Custom Requests */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Custom Removal Request</h2>
        <form onSubmit={handleCustomRequest} className="flex gap-3 mb-4">
          <input
            type="url"
            placeholder="https://example.com/your-listing"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            required
            className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "custom" ? "Adding…" : "Add Request"}
          </button>
        </form>

        {customRequests.length > 0 && (
          <div className="space-y-2">
            {customRequests.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm"
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
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">No removal requests yet.</p>
          <p className="text-sm mt-2">
            Run a scan to discover exposed data, then submit a removal request.
          </p>
        </div>
      ) : null}
    </main>
  );
}

function Card({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function isManualFallback(req: RemovalRequest) {
  return req.method === "manual_link" && Boolean(req.lastError);
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

function getDeliveryView(req: RemovalRequest): {
  title: string;
  detail: string;
  failure: string | null;
  titleClassName: string;
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
        titleClassName: "text-orange-300",
      };
    }

    return {
      title: "Delivery issue detected",
      detail: attemptedAt
        ? `The last delivery attempt was recorded on ${formatDateTime(attemptedAt)}.`
        : "A broker delivery attempt failed and may need another retry.",
      failure: trimMessage(req.lastError),
      titleClassName: "text-red-300",
    };
  }

  if (req.sentAt) {
    return {
      title: "Broker email sent",
      detail: req.providerMessageId
        ? `Sent ${formatDateTime(req.sentAt)}. Provider id: ${shortId(req.providerMessageId)}`
        : `Sent ${formatDateTime(req.sentAt)}.`,
      failure: null,
      titleClassName: "text-blue-300",
    };
  }

  if (req.method === "manual_link") {
    return {
      title: "Manual link generated",
      detail: "This broker currently relies on a direct manual opt-out link instead of outbound email.",
      failure: null,
      titleClassName: "text-orange-300",
    };
  }

  if (req.method === "form") {
    return {
      title: "Form automation path",
      detail: "This broker is tracked as a form-based workflow rather than an email send.",
      failure: null,
      titleClassName: "text-gray-300",
    };
  }

  if (req.method === "api") {
    return {
      title: "API workflow path",
      detail: "This broker is tracked as an API-based workflow rather than an email send.",
      failure: null,
      titleClassName: "text-gray-300",
    };
  }

  return {
    title: "Waiting to send",
    detail: req.attemptCount > 0
      ? "A previous send attempt was recorded, but the request is still waiting on delivery."
      : "This broker email is queued but has not been sent yet.",
    failure: null,
    titleClassName: "text-gray-300",
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
