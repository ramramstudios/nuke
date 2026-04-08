"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Banner,
  EmptyState,
  LoadingScreen,
  PageContent,
  PageHeader,
  StatCard,
} from "@/components/ui";
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
        setError(getResponseErrorMessage(reviewPayload, "Could not load the review queue."));
        setLoading(false);
        return;
      }

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

  if (loading) {
    return <LoadingScreen message="Loading review queue…" />;
  }

  return (
    <PageContent>
        <PageHeader
          title="Operator Review Queue"
          subtitle="Resolve ambiguous broker replies and blocked next-step tasks without touching raw database records."
        />

        {error && <Banner tone="error">{error}</Banner>}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Queue Items" value={reviewMetrics.total} />
          <StatCard label="Held Tasks" value={reviewMetrics.withPendingTasks} accent={reviewMetrics.withPendingTasks > 0} />
          <StatCard label="Match Problems" value={reviewMetrics.matchProblems} accent={reviewMetrics.matchProblems > 0} />
          <StatCard label="Status-Eligible" value={reviewMetrics.requestEligible} />
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="The review queue is clear."
            body="New ambiguous replies and blocked follow-up tasks will appear here automatically."
          />
        ) : (
        <section className="space-y-5">
          {items.map((item) => {
            const note = notes[item.id] ?? "";

            return (
              <article
                key={item.id}
                className="rounded-2xl border p-5"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
                        {item.broker?.name ?? item.fromAddress}
                      </h2>
                      {item.request && <StatusBadge status={item.request.status} />}
                      {item.pendingReviewTask && <StatusBadge status="pending_review" />}
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-faint)" }}>
                      Received {formatDateTime(item.receivedAt)} from{" "}
                      <span style={{ color: "var(--text-2)" }}>{item.fromAddress}</span>
                    </p>
                    <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
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
                      <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                        Subject:{" "}
                        <span style={{ color: "var(--text-2)" }}>{item.subject ?? "(No subject)"}</span>
                      </p>
                      <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                        {item.excerpt || "No message excerpt was available for this reply."}
                      </p>
                    </ReviewPanel>

                    {item.pendingReviewTask && (
                      <ReviewPanel title="Held User Task">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
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
                        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
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
                        <p className="text-sm" style={{ color: "var(--text-faint)" }}>No match signals were recorded.</p>
                      )}
                      <div className="mt-4" />
                      {item.classificationSignals.length > 0 ? (
                        <SignalList
                          label="Classification signals"
                          values={item.classificationSignals}
                        />
                      ) : (
                        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                          No classification signals were recorded.
                        </p>
                      )}
                    </ReviewPanel>

                    <ReviewPanel title="Resolve">
                      <label className="block">
                        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>Operator note</span>
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
                          className="mt-2 w-full rounded-xl px-3 py-2 text-sm"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                          }}
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
      </PageContent>
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
    <section
      className="rounded-xl border p-4"
      style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
    >
      <h3
        className="text-sm font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--text-faint)" }}
      >
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SignalList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
        {label}
      </p>
      <ul className="mt-2 space-y-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        {values.map((value, index) => (
          <li key={`${label}-${index}`}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs border"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
    >
      <span style={{ color: "var(--text-faint)" }}>{label}:</span> {value}
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
  const style =
    tone === "warning"
      ? { background: "rgba(120,53,15,0.4)", borderColor: "rgba(146,64,14,0.6)", color: "#fcd34d" }
      : tone === "neutral"
        ? { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
        : { background: "rgba(30,58,138,0.3)", borderColor: "rgba(30,64,175,0.5)", color: "#93c5fd" };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={style}
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
