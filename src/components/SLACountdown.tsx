"use client";

export function SLACountdown({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span style={{ color: "var(--text-faint)" }}>—</span>;

  const target = new Date(deadline);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="font-medium" style={{ color: "rgb(248,113,113)" }}>
        {Math.abs(diffDays)}d overdue
      </span>
    );
  }

  const color =
    diffDays <= 7
      ? "rgb(248,113,113)"
      : diffDays <= 14
        ? "rgb(251,191,36)"
        : "var(--text-muted)";

  return <span style={{ color }}>{diffDays}d remaining</span>;
}
