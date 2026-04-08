type StatusStyle = { background: string; color: string; borderColor: string };

const styleMap: Record<string, StatusStyle> = {
  pending:             { background: "rgba(161,98,7,0.15)",   color: "rgb(253,224,71)",  borderColor: "rgba(161,98,7,0.4)" },
  submitted:           { background: "rgba(29,78,216,0.15)",  color: "rgb(147,197,253)", borderColor: "rgba(29,78,216,0.4)" },
  acknowledged:        { background: "rgba(67,56,202,0.15)",  color: "rgb(165,180,252)", borderColor: "rgba(67,56,202,0.4)" },
  completed:           { background: "rgba(21,128,61,0.15)",  color: "rgb(134,239,172)", borderColor: "rgba(21,128,61,0.4)" },
  rejected:            { background: "rgba(185,28,28,0.15)",  color: "rgb(252,165,165)", borderColor: "rgba(185,28,28,0.4)" },
  requires_user_action:{ background: "rgba(194,65,12,0.15)",  color: "rgb(253,186,116)", borderColor: "rgba(194,65,12,0.4)" },
  pending_review:      { background: "rgba(21,94,117,0.15)",  color: "rgb(165,243,252)", borderColor: "rgba(21,94,117,0.4)" },
  awaiting_payment:    { background: "rgba(180,83,9,0.15)",   color: "rgb(252,211,77)",  borderColor: "rgba(180,83,9,0.4)" },
  queued:              { background: "rgba(3,105,161,0.15)",  color: "rgb(186,230,253)", borderColor: "rgba(3,105,161,0.4)" },
  active:              { background: "rgba(6,95,70,0.15)",    color: "rgb(110,231,183)", borderColor: "rgba(6,95,70,0.4)" },
  invoice_pending:     { background: "rgba(180,83,9,0.15)",   color: "rgb(252,211,77)",  borderColor: "rgba(180,83,9,0.4)" },
  payment_submitted:   { background: "rgba(3,105,161,0.15)",  color: "rgb(186,230,253)", borderColor: "rgba(3,105,161,0.4)" },
  paid:                { background: "rgba(6,95,70,0.15)",    color: "rgb(110,231,183)", borderColor: "rgba(6,95,70,0.4)" },
  refunded:            { background: "rgba(63,63,70,0.3)",    color: "rgb(212,212,216)", borderColor: "rgba(63,63,70,0.6)" },
  running:             { background: "rgba(29,78,216,0.15)",  color: "rgb(147,197,253)", borderColor: "rgba(29,78,216,0.4)" },
  failed:              { background: "rgba(185,28,28,0.15)",  color: "rgb(252,165,165)", borderColor: "rgba(185,28,28,0.4)" },
};

const fallbackStyle: StatusStyle = {
  background: "rgba(82,82,91,0.3)",
  color: "rgb(212,212,216)",
  borderColor: "rgba(82,82,91,0.5)",
};

export function StatusBadge({ status }: { status: string }) {
  const s = styleMap[status] ?? fallbackStyle;
  const label = status.replace(/_/g, " ");

  return (
    <span
      className="inline-block px-2 py-0.5 text-xs font-medium rounded border"
      style={{ background: s.background, color: s.color, borderColor: s.borderColor }}
    >
      {label}
    </span>
  );
}
