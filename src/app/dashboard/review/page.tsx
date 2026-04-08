"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";
import type { ReviewQueueItem, ReviewResolutionAction } from "@/lib/review/queue";

interface SessionUser {
  email: string;
  hasProfile: boolean;
}

export default function ReviewQueuePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadQueue() {
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

      const reviewRes = await fetch("/api/review", { cache: "no-store" });
      const reviewPayload = await parseJsonResponse<ReviewQueueItem[]>(reviewRes);

      if (cancelled) {
        return;
      }

      if (!reviewRes.ok || !reviewPayload.data) {
        setUser(mePayload.data);
        setError(getResponseErrorMessage(reviewPayload, "Could not load the review queue."));
        setLoading(false);
        return;
      }

      setUser(mePayload.data);
      setItems(reviewPayload.data);
      setError("");
      setLoading(false);
    }

    void loadQueue();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const reviewMetrics = useMemo(() => {
    const withPendingTasks = items.filter((item) => Boolean(item.pendingReviewTask)).length;
    const matchProblems = items.filter((item) => item.matchStatus !== "matched").length;
    const requestEligible = items.filter(
      (item) =>
        item.availableActions.markAcknowledged ||
        item.availableActions.markCompleted ||
        item.availableActions.markRejected
    ).length;

    return {
      total: items.length,
      withPendingTasks,
      matchProblems,
      requestEligible,
    };
  }, [items]);

  async function refreshQueue() {
    const res = await fetch("/api/review", { cache: "no-store" });
    const payload = await parseJsonResponse<ReviewQueueItem[]>(res);

    if (!res.ok || !payload.data) {
      setError(getResponseErrorMessage(payload, "Could not refresh the review queue."));
      return;
    }

    setItems(payload.data);
    setError("");
  }

  async function handleResolve(itemId: string, action: ReviewResolutionAction) {
    setActionLoading(`${itemId}:${action}`);
    setError("");

    const res = await fetch(`/api/review/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        note: notes[itemId]?.trim() || undefined,
      }),
    });
    const payload = await parseJsonResponse<{ status?: string }>(res);

    if (!res.ok) {
      setError(getResponseErrorMessage(payload, "Could not resolve that review item."));
      setActionLoading("");
      return;
    }

    setNotes((current) => {
      if (!current[itemId]) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setActionLoading("");
    await refreshQueue();
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
        <p className="text-gray-500">Loading review queue…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Operator Review Queue</h1>
          <p className="text-gray-400 text-sm mt-1">
            Resolve ambiguous broker replies and blocked next-step tasks without touching raw
            database records.
          </p>
          <p className="text-gray-500 text-sm mt-2">{user?.email}</p>
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
            href="/dashboard/metrics"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Metrics
          </Link>
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Queue Items" value={reviewMetrics.total} />
        <MetricCard label="Held Tasks" value={reviewMetrics.withPendingTasks} color="text-orange-300" />
        <MetricCard label="Match Problems" value={reviewMetrics.matchProblems} color="text-red-300" />
        <MetricCard label="Status-Eligible" value={reviewMetrics.requestEligible} color="text-blue-300" />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 px-6 py-16 text-center">
          <p className="text-lg text-gray-300">The review queue is clear.</p>
          <p className="mt-2 text-sm text-gray-500">
            New ambiguous replies and blocked follow-up tasks will appear here automatically.
          </p>
        </div>
      ) : (
        <section className="space-y-5">
          {items.map((item) => {
            const note = notes[item.id] ?? "";

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">
                        {item.broker?.name ?? item.fromAddress}
                      </h2>
                      {item.request && <StatusBadge status={item.request.status} />}
                      {item.pendingReviewTask && <StatusBadge status="pending_review" />}
                    </div>
                    <p className="mt-1 text-sm text-gray-400">
                      Received {formatDateTime(item.receivedAt)} from{" "}
                      <span className="text-gray-200">{item.fromAddress}</span>
                    </p>
                    <p className="mt-3 text-sm leading-6 text-gray-300">
                      {item.reviewReason}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MetaChip
                      label="Match"
                      value={formatMatchStatus(item.matchStatus, item.matchConfidence)}
                    />
                    <MetaChip
                      label="Classification"
                      value={formatClassification(
                        item.classification,
                        item.classificationConfidence
                      )}
                    />
                    {item.request?.submittedAt && (
                      <MetaChip
                        label="Submitted"
                        value={formatDateTime(item.request.submittedAt)}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
                  <div className="space-y-4">
                    <ReviewPanel title="Message">
                      <p className="text-sm text-gray-400">
                        Subject:{" "}
                        <span className="text-gray-200">{item.subject ?? "(No subject)"}</span>
                      </p>
                      <p className="mt-3 text-sm leading-6 text-gray-300">
                        {item.excerpt || "No message excerpt was available for this reply."}
                      </p>
                    </ReviewPanel>

                    {item.pendingReviewTask && (
                      <ReviewPanel title="Held User Task">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">
                            {item.pendingReviewTask.title}
                          </p>
                          <MetaChip
                            label="Action"
                            value={item.pendingReviewTask.actionType.replace(/_/g, " ")}
                          />
                          {item.pendingReviewTask.dueAt && (
                            <MetaChip
                              label="Due"
                              value={formatDateTime(item.pendingReviewTask.dueAt)}
                            />
                          )}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-gray-300">
                          {item.pendingReviewTask.instructions}
                        </p>
                      </ReviewPanel>
                    )}
                  </div>

                  <div className="space-y-4">
                    <ReviewPanel title="Signals">
                      {item.matchSignals.length > 0 ? (
                        <SignalList label="Match signals" values={item.matchSignals} />
                      ) : (
                        <p className="text-sm text-gray-500">No match signals were recorded.</p>
                      )}
                      <div className="mt-4" />
                      {item.classificationSignals.length > 0 ? (
                        <SignalList
                          label="Classification signals"
                          values={item.classificationSignals}
                        />
                      ) : (
                        <p className="text-sm text-gray-500">
                          No classification signals were recorded.
                        </p>
                      )}
                    </ReviewPanel>

                    <ReviewPanel title="Resolve">
                      <label className="block">
                        <span className="text-sm font-medium text-white">Operator note</span>
                        <textarea
                          value={note}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Optional context to append when promoting a task or recording a rejection reason."
                          rows={4}
                          className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                        />
                      </label>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <ActionButton
                          disabled={!item.availableActions.markAcknowledged || !!actionLoading}
                          loading={actionLoading === `${item.id}:mark_acknowledged`}
                          label="Mark acknowledged"
                          onClick={() => handleResolve(item.id, "mark_acknowledged")}
                        />
                        <ActionButton
                          disabled={!item.availableActions.markCompleted || !!actionLoading}
                          loading={actionLoading === `${item.id}:mark_completed`}
                          label="Mark completed"
                          onClick={() => handleResolve(item.id, "mark_completed")}
                        />
                        <ActionButton
                          disabled={!item.availableActions.markRejected || !!actionLoading}
                          loading={actionLoading === `${item.id}:mark_rejected`}
                          label="Mark rejected"
                          onClick={() => handleResolve(item.id, "mark_rejected")}
                        />
                        <ActionButton
                          disabled={!item.availableActions.requestUserAction || !!actionLoading}
                          loading={actionLoading === `${item.id}:request_user_action`}
                          label="Request user action"
                          onClick={() => handleResolve(item.id, "request_user_action")}
                          tone="warning"
                        />
                        <ActionButton
                          disabled={!item.availableActions.dismissNoise || !!actionLoading}
                          loading={actionLoading === `${item.id}:dismiss_noise`}
                          label="Dismiss as noise"
                          onClick={() => handleResolve(item.id, "dismiss_noise")}
                          tone="neutral"
                        />
                      </div>
                    </ReviewPanel>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-400">{label}</div>
    </div>
  );
}

function ReviewPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-800 bg-black/20 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SignalList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-gray-300">
        {values.map((value, index) => (
          <li key={`${label}-${index}`}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900 px-2.5 py-0.5 text-xs text-gray-300">
      <span className="text-gray-500">{label}:</span> {value}
    </span>
  );
}

function ActionButton({
  disabled,
  label,
  loading,
  onClick,
  tone = "primary",
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onClick: () => void;
  tone?: "primary" | "warning" | "neutral";
}) {
  const classes =
    tone === "warning"
      ? "border-orange-800 bg-orange-950/40 text-orange-200 hover:bg-orange-900/40"
      : tone === "neutral"
        ? "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800"
        : "border-blue-800 bg-blue-950/40 text-blue-200 hover:bg-blue-900/40";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {loading ? "Working…" : label}
    </button>
  );
}

function formatMatchStatus(status: string, confidence: number | null) {
  const label = status.replace(/_/g, " ");
  if (confidence == null) {
    return label;
  }

  return `${label} (${confidence}%)`;
}

function formatClassification(
  classification: string | null,
  confidence: number | null
) {
  const label = classification ? classification.replace(/_/g, " ") : "unclassified";
  if (confidence == null) {
    return label;
  }

  return `${label} (${confidence}%)`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
