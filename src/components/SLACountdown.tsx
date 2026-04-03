"use client";

export function SLACountdown({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span className="text-gray-600">—</span>;

  const target = new Date(deadline);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="text-red-400 font-medium">
        {Math.abs(diffDays)}d overdue
      </span>
    );
  }

  const color =
    diffDays <= 7
      ? "text-red-400"
      : diffDays <= 14
        ? "text-yellow-400"
        : "text-gray-400";

  return <span className={color}>{diffDays}d remaining</span>;
}
