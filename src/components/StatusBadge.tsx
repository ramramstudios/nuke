/**
 * Status as a single colored word, not a tinted pill. The new design uses
 * weight + color for emphasis instead of background fills.
 */

type StatusBucket = "pending" | "active" | "success" | "danger" | "warning" | "neutral";

const bucketByStatus: Record<string, StatusBucket> = {
  pending: "pending",
  submitted: "active",
  acknowledged: "active",
  completed: "success",
  rejected: "danger",
  requires_user_action: "warning",
  pending_review: "active",
  queued: "active",
  active: "success",
  running: "active",
  failed: "danger",
  superseded: "neutral",
  canceled: "danger",
};

const colorByBucket: Record<StatusBucket, string> = {
  pending: "var(--status-pending)",
  active: "var(--status-active)",
  success: "var(--status-success)",
  danger: "var(--status-danger)",
  warning: "var(--status-warning)",
  neutral: "var(--text-muted)",
};

export function StatusBadge({ status }: { status: string }) {
  const bucket = bucketByStatus[status] ?? "neutral";
  const label = status.replace(/_/g, " ");

  return (
    <span
      className="inline-block text-xs font-semibold uppercase tracking-wide"
      style={{ color: colorByBucket[bucket] }}
    >
      {label}
    </span>
  );
}
