"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";
import type { ManagedServiceDashboardData } from "@/lib/managed-service/types";

interface SessionUser {
  email: string;
  hasProfile: boolean;
}

export default function ManagedServicePage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<ManagedServiceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [contactPreference, setContactPreference] = useState<"email" | "dashboard">(
    "email"
  );
  const [preferredStartWindow, setPreferredStartWindow] = useState("This week");
  const [notes, setNotes] = useState("");
  const [acceptScope, setAcceptScope] = useState(false);
  const [acceptManualBilling, setAcceptManualBilling] = useState(false);
  const [acceptSupportWorkflow, setAcceptSupportWorkflow] = useState(false);

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

      const managedRes = await fetch("/api/managed-service", { cache: "no-store" });
      const managedPayload = await parseJsonResponse<ManagedServiceDashboardData>(managedRes);

      if (cancelled) {
        return;
      }

      if (!managedRes.ok || !managedPayload.data) {
        setUser(mePayload.data);
        setFeedback({
          tone: "error",
          text: getResponseErrorMessage(
            managedPayload,
            "Could not load the concierge pilot package."
          ),
        });
        setLoading(false);
        return;
      }

      setUser(mePayload.data);
      setData(managedPayload.data);
      setFeedback(null);
      setLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleRefresh() {
    setActionLoading("refresh");
    const res = await fetch("/api/managed-service", { cache: "no-store" });
    const payload = await parseJsonResponse<ManagedServiceDashboardData>(res);
    setActionLoading("");

    if (!res.ok || !payload.data) {
      setFeedback({
        tone: "error",
        text: getResponseErrorMessage(payload, "Could not refresh the concierge pilot view."),
      });
      return;
    }

    setData(payload.data);
    setFeedback({
      tone: "info",
      text: "Concierge pilot details refreshed.",
    });
  }

  async function handleReserveSpot() {
    if (!acceptScope || !acceptManualBilling || !acceptSupportWorkflow) {
      setFeedback({
        tone: "error",
        text: "Please confirm the package scope, manual billing path, and support workflow before reserving a spot.",
      });
      return;
    }

    setSaving(true);
    const res = await fetch("/api/managed-service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactPreference,
        preferredStartWindow,
        notes: notes.trim() || undefined,
        acceptScope: true,
        acceptManualBilling: true,
        acceptSupportWorkflow: true,
      }),
    });
    const payload = await parseJsonResponse<ManagedServiceDashboardData>(res);
    setSaving(false);

    if (!res.ok || !payload.data) {
      setFeedback({
        tone: "error",
        text: getResponseErrorMessage(payload, "Could not reserve the concierge pilot."),
      });
      return;
    }

    setData(payload.data);
    setFeedback({
      tone: "success",
      text: "Your concierge pilot slot is reserved. Use the invoice reference below when you submit payment.",
    });
  }

  async function handleEnrollmentAction(action: "mark_payment_sent" | "cancel") {
    setActionLoading(action);
    const res = await fetch("/api/managed-service", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = await parseJsonResponse<ManagedServiceDashboardData>(res);
    setActionLoading("");

    if (!res.ok || !payload.data) {
      setFeedback({
        tone: "error",
        text: getResponseErrorMessage(payload, "Could not update the concierge pilot."),
      });
      return;
    }

    setData(payload.data);
    setFeedback({
      tone: "success",
      text:
        action === "mark_payment_sent"
          ? "Payment marked as sent. The package has moved into the kickoff queue."
          : "The concierge pilot enrollment has been canceled.",
    });
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
        <p className="text-gray-500">Loading concierge pilot…</p>
      </main>
    );
  }

  const packageInfo = data?.package ?? null;
  const enrollment = data?.enrollment ?? null;

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Managed-Service Pilot</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
          <p className="text-gray-500 text-sm mt-2 max-w-3xl">
            Human-supported submission review and follow-up handling for the current
            pilot cohort. This package is intentionally manual-invoice while Stripe
            remains a later milestone.
          </p>
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
            href="/dashboard/metrics"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Metrics
          </Link>
          <button
            onClick={handleRefresh}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium text-gray-100 disabled:opacity-50 transition-colors"
          >
            {actionLoading === "refresh" ? "Refreshing…" : "Refresh"}
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

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            feedback.tone === "error"
              ? "border border-red-800 bg-red-950/30 text-red-300"
              : feedback.tone === "success"
                ? "border border-emerald-800 bg-emerald-950/30 text-emerald-200"
                : "border border-blue-800 bg-blue-950/30 text-blue-200"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {packageInfo && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Pilot Price"
              value={formatCurrency(packageInfo.priceUsd)}
              detail="One-time pilot fee"
            />
            <MetricCard
              label="Seats Remaining"
              value={data.seatsRemaining}
              detail={`${data.seatsFilled} of ${packageInfo.cohortCapacity} pilot slots currently reserved`}
              tone={data.seatsRemaining <= 2 ? "warning" : "neutral"}
            />
            <MetricCard
              label="Included Broker Scope"
              value={packageInfo.includedBrokerCount}
              detail={`${packageInfo.includedFollowUpRounds} human follow-up rounds included`}
            />
            <MetricCard
              label="Current Account Load"
              value={`${data.workload.openRequests} open / ${data.workload.stalledRequests} stalled`}
              detail={`${data.workload.pendingTasks} pending task(s), ${data.workload.pendingReview} review flag(s)`}
              tone={data.workload.stalledRequests > 0 ? "warning" : "neutral"}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-6">
              <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                <h2 className="text-xl font-semibold text-white">{packageInfo.name}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-300">
                  {packageInfo.supportWorkflowSummary}
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <InfoPanel title="What’s Included">
                    {packageInfo.scopeHighlights.map((item) => (
                      <ListRow key={item}>{item}</ListRow>
                    ))}
                  </InfoPanel>
                  <InfoPanel title="What’s Out of Scope">
                    {packageInfo.exclusions.map((item) => (
                      <ListRow key={item}>{item}</ListRow>
                    ))}
                  </InfoPanel>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Support Workflow</h2>
                    <p className="mt-1 text-sm text-gray-400">
                      Defined handoff steps for the pilot cohort, with manual billing
                      and dashboard-visible status updates.
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-black/20 px-3 py-2 text-sm text-gray-300">
                    {packageInfo.supportHours}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {packageInfo.workflowSteps.map((step, index) => (
                    <WorkflowStep
                      key={step.key}
                      index={index + 1}
                      title={step.title}
                      description={step.description}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                <h2 className="text-xl font-semibold text-white">Turnaround Expectations</h2>
                <p className="mt-2 text-sm leading-6 text-gray-300">
                  {packageInfo.turnaroundSummary}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <MetricPill label="Support email" value={packageInfo.supportEmail} />
                  <MetricPill label="Metrics snapshot" value={formatDateTime(data.workload.generatedAt)} />
                  <MetricPill label="Completed requests" value={data.workload.completedRequests} />
                  <MetricPill label="Contact mode" value={enrollment?.contactPreference ?? contactPreference} />
                </div>
              </div>

              {enrollment ? (
                <EnrollmentCard
                  enrollment={enrollment}
                  supportEmail={packageInfo.supportEmail}
                  actionLoading={actionLoading}
                  onMarkPaymentSent={() => handleEnrollmentAction("mark_payment_sent")}
                  onCancel={() => handleEnrollmentAction("cancel")}
                />
              ) : (
                <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                  <h2 className="text-xl font-semibold text-white">Reserve a Pilot Spot</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-300">
                    Reserve a seat now and we’ll use your current account workload to
                    scope kickoff. Payment is manual for this pilot, and the dashboard
                    will track the next support checkpoint after you reserve.
                  </p>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-200">
                        Preferred contact channel
                      </span>
                      <select
                        value={contactPreference}
                        onChange={(event) =>
                          setContactPreference(
                            event.target.value as "email" | "dashboard"
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                      >
                        <option value="email">Email first</option>
                        <option value="dashboard">Dashboard first</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-gray-200">
                        Preferred kickoff window
                      </span>
                      <select
                        value={preferredStartWindow}
                        onChange={(event) => setPreferredStartWindow(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                      >
                        <option>This week</option>
                        <option>Next week</option>
                        <option>Within two weeks</option>
                        <option>Flexible</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-medium text-gray-200">
                        Concierge notes
                      </span>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={5}
                        placeholder="Priority brokers, travel dates, identity-verification concerns, or anything else the concierge team should know."
                        className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                      />
                    </label>

                    <ChecklistItem
                      checked={acceptScope}
                      onChange={setAcceptScope}
                      label={`I understand this pilot includes up to ${packageInfo.includedBrokerCount} broker requests and ${packageInfo.includedFollowUpRounds} human follow-up rounds.`}
                    />
                    <ChecklistItem
                      checked={acceptManualBilling}
                      onChange={setAcceptManualBilling}
                      label="I understand payment is handled manually for this pilot and not through Stripe checkout yet."
                    />
                    <ChecklistItem
                      checked={acceptSupportWorkflow}
                      onChange={setAcceptSupportWorkflow}
                      label="I understand the dashboard will reflect support checkpoints, but some concierge actions still require human confirmation."
                    />

                    <button
                      type="button"
                      onClick={handleReserveSpot}
                      disabled={saving || data.seatsRemaining === 0}
                      className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {saving
                        ? "Reserving your pilot spot…"
                        : data.seatsRemaining === 0
                          ? "Current pilot cohort is full"
                          : `Reserve for ${formatCurrency(packageInfo.priceUsd)}`}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        tone === "warning"
          ? "border-orange-900/60 bg-orange-950/20"
          : "border-gray-800 bg-gray-950/40"
      }`}
    >
      <p className="text-sm uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-3 text-sm leading-6 text-gray-400">{detail}</p>
    </div>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-black/20 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
        {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function ListRow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-6 text-gray-300">{children}</p>;
}

function WorkflowStep({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-gray-800 bg-black/20 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-800 bg-red-950/40 text-sm font-semibold text-red-200">
        {index}
      </div>
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-gray-300">{description}</p>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-100">{value}</p>
    </div>
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
    <label className="flex items-start gap-3 rounded-xl border border-gray-800 bg-black/20 px-4 py-3 text-sm text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-900 text-red-500 focus:ring-red-500/30"
      />
      <span className="leading-6">{label}</span>
    </label>
  );
}

function EnrollmentCard({
  enrollment,
  supportEmail,
  actionLoading,
  onMarkPaymentSent,
  onCancel,
}: {
  enrollment: ManagedServiceDashboardData["enrollment"];
  supportEmail: string;
  actionLoading: string;
  onMarkPaymentSent: () => void;
  onCancel: () => void;
}) {
  if (!enrollment) {
    return null;
  }

  const canMarkPaymentSent =
    enrollment.status !== "canceled" &&
    enrollment.status !== "completed" &&
    enrollment.billingStatus === "invoice_pending";
  const canCancel =
    enrollment.status !== "canceled" && enrollment.status !== "completed";

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Your Pilot Enrollment</h2>
          <p className="mt-2 text-sm leading-6 text-gray-300">
            Track billing and support status here while the pilot is still operating
            with a manual invoice workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={enrollment.status} />
          <StatusBadge status={enrollment.billingStatus} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <MetricPill label="Invoice reference" value={enrollment.invoiceReference} />
        <MetricPill label="Pilot fee" value={formatCurrency(enrollment.priceUsd)} />
        <MetricPill
          label="Requested"
          value={formatDateTime(enrollment.requestedAt)}
        />
        <MetricPill
          label="Next check-in"
          value={
            enrollment.nextCheckInAt
              ? formatDateTime(enrollment.nextCheckInAt)
              : "Not scheduled"
          }
        />
        <MetricPill label="Support email" value={supportEmail} />
        <MetricPill
          label="Preferred start"
          value={enrollment.preferredStartWindow ?? "Flexible"}
        />
      </div>

      <div className="mt-5 rounded-xl border border-gray-800 bg-black/20 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
          Enrollment Snapshot
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ListRow>
            Workload at reservation: {enrollment.currentOpenRequestCount} open
            requests, {enrollment.currentStalledRequestCount} stalled requests.
          </ListRow>
          <ListRow>
            Task load at reservation: {enrollment.currentPendingTaskCount} pending
            tasks, {enrollment.currentPendingReviewCount} review flags.
          </ListRow>
          <ListRow>
            Package scope: up to {enrollment.includedBrokerCount} brokers with{" "}
            {enrollment.includedFollowUpRounds} human follow-up rounds.
          </ListRow>
          <ListRow>Contact preference: {enrollment.contactPreference}</ListRow>
        </div>
        {enrollment.notes && (
          <p className="mt-4 text-sm leading-6 text-gray-300">
            Concierge notes: {enrollment.notes}
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-sky-900/50 bg-sky-950/20 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">
          Current Support Note
        </h3>
        <p className="mt-2 text-sm leading-6 text-sky-100/90">
          {enrollment.latestOperatorNote ??
            "No operator note has been posted yet. The dashboard will show the next support checkpoint here."}
        </p>
        {enrollment.paymentSubmittedAt && (
          <p className="mt-3 text-xs text-sky-200/80">
            Payment marked sent {formatDateTime(enrollment.paymentSubmittedAt)}.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onMarkPaymentSent}
          disabled={!canMarkPaymentSent || !!actionLoading}
          className="rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {actionLoading === "mark_payment_sent"
            ? "Recording payment…"
            : canMarkPaymentSent
              ? "I’ve sent payment"
              : "Payment already recorded"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={!canCancel || !!actionLoading}
          className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-50"
        >
          {actionLoading === "cancel" ? "Canceling…" : "Cancel pilot request"}
        </button>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}
