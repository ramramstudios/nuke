const colorMap: Record<string, string> = {
  pending: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  submitted: "bg-blue-900/50 text-blue-300 border-blue-800",
  acknowledged: "bg-indigo-900/50 text-indigo-300 border-indigo-800",
  completed: "bg-green-900/50 text-green-300 border-green-800",
  rejected: "bg-red-900/50 text-red-300 border-red-800",
  requires_user_action: "bg-orange-900/50 text-orange-300 border-orange-800",
  pending_review: "bg-cyan-950/50 text-cyan-200 border-cyan-800",
  awaiting_payment: "bg-amber-950/50 text-amber-200 border-amber-800",
  queued: "bg-sky-950/50 text-sky-200 border-sky-800",
  active: "bg-emerald-950/50 text-emerald-200 border-emerald-800",
  invoice_pending: "bg-amber-950/50 text-amber-200 border-amber-800",
  payment_submitted: "bg-sky-950/50 text-sky-200 border-sky-800",
  paid: "bg-emerald-950/50 text-emerald-200 border-emerald-800",
  refunded: "bg-zinc-800/70 text-zinc-200 border-zinc-700",
  running: "bg-blue-900/50 text-blue-300 border-blue-800",
  failed: "bg-red-900/50 text-red-300 border-red-800",
};

export function StatusBadge({ status }: { status: string }) {
  const classes = colorMap[status] ?? "bg-gray-800 text-gray-300 border-gray-700";
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${classes}`}
    >
      {label}
    </span>
  );
}
