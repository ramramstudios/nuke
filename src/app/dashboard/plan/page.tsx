"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  LoadingScreen,
  PageContent,
  PageHeader,
} from "@/components/ui";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";
import type {
  ConsumerBrokerCoverage,
  ConsumerCoverageBucket,
  ConsumerCoverageBucketSummary,
  SelfServePlanCatalogEntry,
  SelfServePlanDashboardData,
  SelfServePlanKey,
} from "@/lib/plans/types";

interface SessionUser {
  email: string;
  hasProfile: boolean;
}

const BUCKET_TONE: Record<
  ConsumerCoverageBucket,
  { border: string; background: string; accent: string }
> = {
  automatic: {
    border: "rgba(6,95,70,0.5)",
    background: "rgba(6,78,59,0.15)",
    accent: "#6ee7b7",
  },
  chore: {
    border: "rgba(29,78,216,0.45)",
    background: "rgba(30,64,175,0.12)",
    accent: "#93c5fd",
  },
  managed: {
    border: "rgba(146,64,14,0.5)",
    background: "rgba(120,53,15,0.15)",
    accent: "#fdba74",
  },
};

export default function PlanPage() {
  const router = useRouter();
  const [data, setData] = useState<SelfServePlanDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [pendingPlanKey, setPendingPlanKey] = useState<SelfServePlanKey | null>(
    null
  );
  const [acknowledgedChoreScope, setAcknowledgedChoreScope] = useState(false);
  const [acknowledgedManagedHandoff, setAcknowledgedManagedHandoff] =
    useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
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

        setFeedback({
          tone: "error",
          text: getResponseErrorMessage(mePayload, "Could not load your session."),
        });
        setLoading(false);
        return;
      }

      if (!mePayload.data || !mePayload.data.hasProfile) {
        router.replace("/onboarding");
        return;
      }

      const planRes = await fetch("/api/plans", { cache: "no-store" });
      const planPayload = await parseJsonResponse<SelfServePlanDashboardData>(
        planRes
      );

      if (cancelled) {
        return;
      }

      if (!planRes.ok || !planPayload.data) {
        setFeedback({
          tone: "error",
          text: getResponseErrorMessage(
            planPayload,
            "Could not load your self-serve plan."
          ),
        });
        setLoading(false);
        return;
      }

      setData(planPayload.data);
      setFeedback(null);
      setLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const activeKey = data?.activeSelection?.planKey ?? null;
  const recommendedKey = data?.recommendation.recommendedPlanKey ?? null;
  const pendingPlan = useMemo(() => {
    if (!data || !pendingPlanKey) return null;
    return data.catalog.find((entry) => entry.key === pendingPlanKey) ?? null;
  }, [data, pendingPlanKey]);

  const requiresChoreAck = Boolean(
    pendingPlan?.acknowledgements.some((item) => item.key === "chore_scope")
  );
  const requiresManagedAck = Boolean(
    pendingPlan?.acknowledgements.some((item) => item.key === "managed_handoff")
  );

  const canConfirm =
    Boolean(pendingPlan) &&
    (!requiresChoreAck || acknowledgedChoreScope) &&
    (!requiresManagedAck || acknowledgedManagedHandoff);

  function handlePickPlan(planKey: SelfServePlanKey) {
    setPendingPlanKey(planKey);
    setAcknowledgedChoreScope(false);
    setAcknowledgedManagedHandoff(false);
    setNotes("");
    setFeedback(null);
  }

  async function handleRefresh() {
    setActionLoading("refresh");
    const res = await fetch("/api/plans", { cache: "no-store" });
    const payload = await parseJsonResponse<SelfServePlanDashboardData>(res);
    setActionLoading("");

    if (!res.ok || !payload.data) {
      setFeedback({
        tone: "error",
        text: getResponseErrorMessage(
          payload,
          "Could not refresh your self-serve plan."
        ),
      });
      return;
    }

    setData(payload.data);
    setFeedback({ tone: "info", text: "Plan view refreshed." });
  }

  async function handleConfirmSelection() {
    if (!pendingPlan || !canConfirm) {
      setFeedback({
        tone: "error",
        text: "Please confirm the plan acknowledgements before continuing.",
      });
      return;
    }

    setActionLoading("confirm");
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planKey: pendingPlan.key,
        acknowledgedChoreScope: requiresChoreAck ? acknowledgedChoreScope : false,
        acknowledgedManagedHandoff: requiresManagedAck
          ? acknowledgedManagedHandoff
          : false,
        notes: notes.trim() || undefined,
      }),
    });
    const payload = await parseJsonResponse<SelfServePlanDashboardData>(res);
    setActionLoading("");

    if (!res.ok || !payload.data) {
      setFeedback({
        tone: "error",
        text: getResponseErrorMessage(payload, "Could not save your plan choice."),
      });
      return;
    }

    setData(payload.data);
    setPendingPlanKey(null);
    setAcknowledgedChoreScope(false);
    setAcknowledgedManagedHandoff(false);
    setNotes("");
    setFeedback({
      tone: "success",
      text: `${pendingPlan.name} is now your active plan.`,
    });
  }

  async function handleCancelActivePlan() {
    setActionLoading("cancel");
    const res = await fetch("/api/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const payload = await parseJsonResponse<SelfServePlanDashboardData>(res);
    setActionLoading("");

    if (!res.ok || !payload.data) {
      setFeedback({
        tone: "error",
        text: getResponseErrorMessage(
          payload,
          "Could not cancel the active plan selection."
        ),
      });
      return;
    }

    setData(payload.data);
    setFeedback({
      tone: "info",
      text: "Your plan selection was cleared.",
    });
  }

  if (loading) {
    return <LoadingScreen message="Loading your self-serve plan…" />;
  }

  if (!data) {
    return (
      <PageContent>
        <PageHeader title="Self-Serve Plan" />
        {feedback && (
          <Banner tone={feedback.tone === "success" ? "success" : feedback.tone === "error" ? "error" : "info"}>
            {feedback.text}
          </Banner>
        )}
      </PageContent>
    );
  }

  const { coverage, recommendation, catalog, history, activeSelection, hasActiveManagedEnrollment } = data;

  return (
    <PageContent wide>
      <PageHeader
        title="Self-Serve Plan"
        subtitle="Pick the plan that matches your account: NUKE handles automatic brokers, you finish quick chores, and the concierge tier picks up the hard ones."
        detail={`Coverage snapshot generated ${formatDateTime(coverage.generatedAt)}`}
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!!actionLoading}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors border"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-2)",
            }}
          >
            {actionLoading === "refresh" ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {feedback && (
        <Banner
          tone={
            feedback.tone === "success"
              ? "success"
              : feedback.tone === "error"
                ? "error"
                : "info"
          }
        >
          {feedback.text}
        </Banner>
      )}

      <CoverageOverview coverage={coverage} />

      <RecommendationCard
        recommendation={recommendation}
        catalog={catalog}
        activePlanKey={activeKey}
      />

      <BucketBreakdown coverage={coverage} />

      <PlanCatalogGrid
        catalog={catalog}
        activePlanKey={activeKey}
        recommendedPlanKey={recommendedKey}
        pendingPlanKey={pendingPlanKey}
        onPick={handlePickPlan}
      />

      {pendingPlan && (
        <PlanConfirmCard
          plan={pendingPlan}
          requiresChoreAck={requiresChoreAck}
          requiresManagedAck={requiresManagedAck}
          acknowledgedChoreScope={acknowledgedChoreScope}
          acknowledgedManagedHandoff={acknowledgedManagedHandoff}
          notes={notes}
          canConfirm={canConfirm}
          saving={actionLoading === "confirm"}
          hasActiveManagedEnrollment={hasActiveManagedEnrollment}
          onChangeChoreAck={setAcknowledgedChoreScope}
          onChangeManagedAck={setAcknowledgedManagedHandoff}
          onChangeNotes={setNotes}
          onConfirm={handleConfirmSelection}
          onCancel={() => setPendingPlanKey(null)}
        />
      )}

      <BrokerCoverageTable brokers={coverage.brokers} />

      <SelectionHistoryCard
        history={history}
        catalog={catalog}
        activeSelection={activeSelection}
        cancelLoading={actionLoading === "cancel"}
        onCancel={handleCancelActivePlan}
      />
    </PageContent>
  );
}

function CoverageOverview({
  coverage,
}: {
  coverage: SelfServePlanDashboardData["coverage"];
}) {
  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
        Your coverage today
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        We split every covered broker into one of three buckets so a plan choice
        is concrete, not abstract.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CoverageStat
          label="Brokers covered"
          value={coverage.totalBrokerCount}
          detail={`Across ${coverage.totalBrokerCount} active broker${coverage.totalBrokerCount === 1 ? "" : "s"} in your registry.`}
        />
        <CoverageStat
          label="Automatic"
          value={coverage.automaticCount}
          detail={`${coverage.automaticRate}% of brokers can be submitted without a chore.`}
          accent="automatic"
        />
        <CoverageStat
          label="Quick chores"
          value={coverage.choreCount}
          detail={
            coverage.outstandingChoreCount > 0
              ? `${coverage.outstandingChoreCount} chore${coverage.outstandingChoreCount === 1 ? "" : "s"} need your attention right now.`
              : "No outstanding chores right now."
          }
          accent="chore"
        />
        <CoverageStat
          label="Managed help"
          value={coverage.managedCount}
          detail={
            coverage.blockedBrokerNames.length > 0
              ? `Includes ${coverage.blockedBrokerNames.slice(0, 3).join(", ")}${coverage.blockedBrokerNames.length > 3 ? `, and ${coverage.blockedBrokerNames.length - 3} more` : ""}.`
              : "No managed-help brokers in your account today."
          }
          accent="managed"
        />
      </div>
    </section>
  );
}

function CoverageStat({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: number | string;
  detail: string;
  accent?: ConsumerCoverageBucket;
}) {
  const tone = accent ? BUCKET_TONE[accent] : null;
  return (
    <div
      className="rounded-2xl border p-5"
      style={
        tone
          ? { borderColor: tone.border, background: tone.background }
          : { borderColor: "var(--border)", background: "var(--bg-subtle)" }
      }
    >
      <p
        className="text-xs uppercase tracking-[0.18em]"
        style={{ color: tone?.accent ?? "var(--text-faint)" }}
      >
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>
        {value}
      </p>
      <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-2)" }}>
        {detail}
      </p>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  catalog,
  activePlanKey,
}: {
  recommendation: SelfServePlanDashboardData["recommendation"];
  catalog: SelfServePlanCatalogEntry[];
  activePlanKey: SelfServePlanKey | null;
}) {
  const recommendedPlan = catalog.find(
    (entry) => entry.key === recommendation.recommendedPlanKey
  );
  if (!recommendedPlan) return null;

  const isActive = activePlanKey === recommendedPlan.key;

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "rgba(190,18,60,0.45)" }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-[0.2em]"
        style={{ color: "#fda4af" }}
      >
        Recommended for your account
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h2 className="text-2xl font-bold" style={{ color: "var(--text)" }}>
          {recommendedPlan.name}
        </h2>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          {formatPlanPrice(recommendedPlan)}
        </span>
        {isActive && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs"
            style={{
              background: "rgba(6,78,59,0.25)",
              color: "#6ee7b7",
              border: "1px solid rgba(6,95,70,0.5)",
            }}
          >
            Currently active
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
        {recommendation.reason}
      </p>
      <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
        {recommendedPlan.recommendation}
      </p>
    </section>
  );
}

function BucketBreakdown({
  coverage,
}: {
  coverage: SelfServePlanDashboardData["coverage"];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {coverage.buckets.map((bucket) => (
        <BucketCard key={bucket.bucket} bucket={bucket} />
      ))}
    </section>
  );
}

function BucketCard({ bucket }: { bucket: ConsumerCoverageBucketSummary }) {
  const tone = BUCKET_TONE[bucket.bucket];
  return (
    <article
      className="rounded-2xl border p-5"
      style={{ borderColor: tone.border, background: tone.background }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          {bucket.label}
        </h3>
        <span className="text-2xl font-bold" style={{ color: tone.accent }}>
          {bucket.brokerCount}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
        {bucket.description}
      </p>

      {bucket.outstandingChoreCount > 0 && (
        <p className="mt-3 text-xs font-semibold" style={{ color: tone.accent }}>
          {bucket.outstandingChoreCount} chore{bucket.outstandingChoreCount === 1 ? "" : "s"} waiting on you
        </p>
      )}

      {bucket.brokerNames.length === 0 ? (
        <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
          No brokers in this bucket yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm" style={{ color: "var(--text-2)" }}>
          {bucket.brokerNames.slice(0, 6).map((name) => (
            <li key={name}>{name}</li>
          ))}
          {bucket.brokerNames.length > 6 && (
            <li style={{ color: "var(--text-faint)" }}>
              and {bucket.brokerNames.length - 6} more
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

function PlanCatalogGrid({
  catalog,
  activePlanKey,
  recommendedPlanKey,
  pendingPlanKey,
  onPick,
}: {
  catalog: SelfServePlanCatalogEntry[];
  activePlanKey: SelfServePlanKey | null;
  recommendedPlanKey: SelfServePlanKey | null;
  pendingPlanKey: SelfServePlanKey | null;
  onPick: (planKey: SelfServePlanKey) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {catalog.map((entry) => {
        const isActive = entry.key === activePlanKey;
        const isRecommended = entry.key === recommendedPlanKey;
        const isPending = entry.key === pendingPlanKey;

        return (
          <article
            key={entry.key}
            className="flex h-full flex-col rounded-2xl border p-5"
            style={{
              background: "var(--surface)",
              borderColor: isActive
                ? "rgba(6,95,70,0.6)"
                : isRecommended
                  ? "rgba(190,18,60,0.55)"
                  : "var(--border)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
                {entry.name}
              </h3>
              {isActive ? (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{
                    background: "rgba(6,78,59,0.25)",
                    color: "#6ee7b7",
                    border: "1px solid rgba(6,95,70,0.5)",
                  }}
                >
                  Active
                </span>
              ) : isRecommended ? (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{
                    background: "rgba(127,29,29,0.2)",
                    color: "#fda4af",
                    border: "1px solid rgba(190,18,60,0.5)",
                  }}
                >
                  Recommended
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {entry.tagline}
            </p>
            <p className="mt-3 text-2xl font-bold" style={{ color: "var(--text)" }}>
              {formatPlanPrice(entry)}
            </p>
            <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-2)" }}>
              {entry.summary}
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
                  Plan handles for you
                </p>
                <ul className="mt-1 space-y-1" style={{ color: "var(--text-2)" }}>
                  {entry.coversBuckets.length > 0
                    ? entry.coversBuckets.map((bucket) => (
                        <li key={bucket}>{describeBucket(bucket, "covers")}</li>
                      ))
                    : (
                      <li style={{ color: "var(--text-faint)" }}>
                        Concierge plan covers everything below.
                      </li>
                    )}
                </ul>
              </div>
              {entry.userHandlesBuckets.length > 0 && (
                <div>
                  <p
                    className="text-xs uppercase tracking-[0.16em]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    You still handle
                  </p>
                  <ul className="mt-1 space-y-1" style={{ color: "var(--text-2)" }}>
                    {entry.userHandlesBuckets.map((bucket) => (
                      <li key={bucket}>{describeBucket(bucket, "user")}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <ul className="mt-4 space-y-2 text-sm" style={{ color: "var(--text-2)" }}>
              {entry.inclusions.map((item) => (
                <li key={item.label}>
                  <span className="font-medium" style={{ color: "var(--text)" }}>
                    {item.label}.
                  </span>{" "}
                  {item.detail}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => onPick(entry.key)}
              disabled={isActive || isPending}
              className="mt-auto rounded-xl px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50"
              style={{
                background: isActive ? "rgba(6,95,70,0.45)" : "var(--accent)",
              }}
            >
              {isActive
                ? "Current plan"
                : isPending
                  ? "Confirm below"
                  : `Choose ${entry.name}`}
            </button>
          </article>
        );
      })}
    </section>
  );
}

function PlanConfirmCard({
  plan,
  requiresChoreAck,
  requiresManagedAck,
  acknowledgedChoreScope,
  acknowledgedManagedHandoff,
  notes,
  canConfirm,
  saving,
  hasActiveManagedEnrollment,
  onChangeChoreAck,
  onChangeManagedAck,
  onChangeNotes,
  onConfirm,
  onCancel,
}: {
  plan: SelfServePlanCatalogEntry;
  requiresChoreAck: boolean;
  requiresManagedAck: boolean;
  acknowledgedChoreScope: boolean;
  acknowledgedManagedHandoff: boolean;
  notes: string;
  canConfirm: boolean;
  saving: boolean;
  hasActiveManagedEnrollment: boolean;
  onChangeChoreAck: (value: boolean) => void;
  onChangeManagedAck: (value: boolean) => void;
  onChangeNotes: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const showManagedHint = plan.key === "concierge-managed" && !hasActiveManagedEnrollment;

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "rgba(190,18,60,0.55)" }}
    >
      <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
        Confirm: {plan.name}
      </h3>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-2)" }}>
        {plan.summary}
      </p>

      {showManagedHint && (
        <p
          className="mt-4 rounded-xl border px-4 py-3 text-sm"
          style={{
            background: "rgba(8,51,68,0.25)",
            borderColor: "rgba(14,116,144,0.5)",
            color: "#cffafe",
          }}
        >
          The concierge plan reuses the existing managed-service pilot. After
          confirming this plan, head to the Concierge tab to reserve your seat
          and complete the manual-invoice step until self-serve checkout ships.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {requiresChoreAck && (
          <ChecklistItem
            checked={acknowledgedChoreScope}
            onChange={onChangeChoreAck}
            label={
              plan.acknowledgements.find((item) => item.key === "chore_scope")
                ?.label ?? ""
            }
          />
        )}
        {requiresManagedAck && (
          <ChecklistItem
            checked={acknowledgedManagedHandoff}
            onChange={onChangeManagedAck}
            label={
              plan.acknowledgements.find((item) => item.key === "managed_handoff")
                ?.label ?? ""
            }
          />
        )}
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
          Notes for the support team (optional)
        </span>
        <textarea
          value={notes}
          onChange={(event) => onChangeNotes(event.target.value)}
          rows={3}
          placeholder="Anything specific you want NUKE to prioritize on this plan."
          className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm || saving}
          className="rounded-xl px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Saving plan…" : `Confirm ${plan.name}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border px-4 py-3 text-sm font-medium transition disabled:opacity-50"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-2)",
          }}
        >
          Back to plan list
        </button>
      </div>
    </section>
  );
}

function BrokerCoverageTable({
  brokers,
}: {
  brokers: ConsumerBrokerCoverage[];
}) {
  if (brokers.length === 0) {
    return (
      <section
        className="rounded-2xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          Broker-by-broker coverage
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Once your account has covered brokers, each broker will appear here
          with the bucket it falls into and the next step required of you.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
        Broker-by-broker coverage
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        Every broker in your registry, the bucket it falls into, and what each
        plan does (or does not) cover for it.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead style={{ color: "var(--text-faint)" }}>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="text-left px-3 py-2 font-medium">Broker</th>
              <th className="text-left px-3 py-2 font-medium">Bucket</th>
              <th className="text-left px-3 py-2 font-medium">Why</th>
              <th className="text-left px-3 py-2 font-medium">Next step</th>
            </tr>
          </thead>
          <tbody>
            {brokers.map((broker) => {
              const tone = BUCKET_TONE[broker.bucket];
              return (
                <tr
                  key={broker.brokerId}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium" style={{ color: "var(--text)" }}>
                      {broker.brokerName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {broker.domain}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs"
                      style={{
                        background: tone.background,
                        color: tone.accent,
                        border: `1px solid ${tone.border}`,
                      }}
                    >
                      {broker.bucketLabel}
                    </span>
                    {broker.hasOpenChore && (
                      <p className="mt-1 text-xs" style={{ color: tone.accent }}>
                        Chore waiting on you
                      </p>
                    )}
                  </td>
                  <td
                    className="px-3 py-3 align-top text-xs leading-5"
                    style={{ color: "var(--text-2)" }}
                  >
                    {broker.bucketReason}
                  </td>
                  <td
                    className="px-3 py-3 align-top text-xs leading-5"
                    style={{ color: "var(--text-2)" }}
                  >
                    {broker.nextStep}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SelectionHistoryCard({
  history,
  catalog,
  activeSelection,
  cancelLoading,
  onCancel,
}: {
  history: SelfServePlanDashboardData["history"];
  catalog: SelfServePlanCatalogEntry[];
  activeSelection: SelfServePlanDashboardData["activeSelection"];
  cancelLoading: boolean;
  onCancel: () => void;
}) {
  if (history.length === 0) {
    return null;
  }

  const planByKey = new Map(catalog.map((entry) => [entry.key, entry]));

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            Plan history
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Every plan you&apos;ve selected along with the coverage snapshot at the
            moment you picked it.
          </p>
        </div>
        {activeSelection && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelLoading}
            className="rounded-xl border px-3 py-2 text-sm font-medium transition disabled:opacity-50"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-2)",
            }}
          >
            {cancelLoading ? "Clearing…" : "Cancel active plan"}
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-3">
        {history.map((entry) => {
          const plan = planByKey.get(entry.planKey);
          return (
            <li
              key={entry.id}
              className="rounded-xl border p-4"
              style={{
                background: "var(--bg-subtle)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {plan?.name ?? entry.planKey}
                </p>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={selectionTone(entry.status)}
                >
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
                Selected {formatDateTime(entry.selectedAt)}
                {entry.supersededAt
                  ? ` · superseded ${formatDateTime(entry.supersededAt)}`
                  : entry.canceledAt
                    ? ` · canceled ${formatDateTime(entry.canceledAt)}`
                    : ""}
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>
                Snapshot: {entry.automaticBrokerCount} automatic /
                {" "}
                {entry.choreBrokerCount} chore /
                {" "}
                {entry.managedBrokerCount} managed
                {" "}
                ({entry.totalBrokerCount} brokers total)
              </p>
              {entry.notes && (
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  Notes: {entry.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChecklistItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{
        background: "var(--bg-subtle)",
        borderColor: "var(--border)",
        color: "var(--text-2)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded"
      />
      <span className="leading-6">{label}</span>
    </label>
  );
}

function selectionTone(status: string): {
  background: string;
  color: string;
  border: string;
} {
  if (status === "active") {
    return {
      background: "rgba(6,78,59,0.25)",
      color: "#6ee7b7",
      border: "1px solid rgba(6,95,70,0.5)",
    };
  }
  if (status === "canceled") {
    return {
      background: "rgba(127,29,29,0.2)",
      color: "#fca5a5",
      border: "1px solid rgba(153,27,27,0.5)",
    };
  }
  return {
    background: "var(--bg-subtle)",
    color: "var(--text-faint)",
    border: "1px solid var(--border)",
  };
}

function describeBucket(
  bucket: ConsumerCoverageBucket,
  perspective: "covers" | "user"
): string {
  if (perspective === "covers") {
    switch (bucket) {
      case "automatic":
        return "Automatic broker submissions";
      case "chore":
        return "Quick-chore brokers (CAPTCHAs, confirmation links, manual flows)";
      case "managed":
        return "Hard-handoff brokers worked by the concierge team";
    }
  }

  switch (bucket) {
    case "automatic":
      return "Automatic submissions (NUKE always handles these)";
    case "chore":
      return "Quick-chore brokers — finish the broker step from the dashboard";
    case "managed":
      return "Hard-handoff brokers — finish on your own or upgrade for managed help";
  }
}

function formatPlanPrice(plan: SelfServePlanCatalogEntry): string {
  if (plan.priceUsd === 0) {
    return "Free";
  }
  return `$${plan.priceUsd}/${plan.cadence === "monthly" ? "mo" : "one-time"}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}
