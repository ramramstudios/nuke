/**
 * Shared UI primitives. Visual style follows Wikipedia/serverless-docs:
 * one column of plain content, thin borders, no surface-on-surface stacking,
 * and no gradient/tinted decoration. Status color lives on text, not pills.
 */

import type { ReactNode } from "react";

/* ─── Page shell ─────────────────────────────────────────────────────────── */

export function PageContent({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={`prose-page ${wide ? "prose-page--wide" : ""} flex-1 w-full`}>
      <div className="space-y-8">{children}</div>
    </main>
  );
}

/* ─── Page header ────────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  detail,
  actions,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="m-0">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {subtitle}
          </p>
        )}
        {detail && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {detail}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2 self-end">{actions}</div>
      )}
    </header>
  );
}

/* ─── Inline status / feedback notice ────────────────────────────────────── */

type BannerTone = "error" | "warning" | "success" | "info";

const BANNER_TEXT: Record<BannerTone, string> = {
  error: "var(--status-danger)",
  warning: "var(--status-warning)",
  success: "var(--status-success)",
  info: "var(--status-active)",
};

export function Banner({
  tone = "error",
  children,
}: {
  tone?: BannerTone;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="border-l-4 pl-3 py-2 text-sm"
      style={{
        borderColor: BANNER_TEXT[tone],
        background: "var(--bg-subtle)",
        color: "var(--text-2)",
      }}
    >
      <span
        className="font-semibold mr-2"
        style={{ color: BANNER_TEXT[tone] }}
      >
        {tone === "error"
          ? "Error:"
          : tone === "warning"
            ? "Note:"
            : tone === "success"
              ? "Done:"
              : "Info:"}
      </span>
      {children}
    </div>
  );
}

/* ─── Stat — compact plain row ───────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  accent = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  /** Kept for back-compat; the new style is already compact. */
  compact?: boolean;
}) {
  void compact;
  return (
    <div className="py-1">
      <div
        className="text-xl font-semibold"
        style={{ color: accent ? "var(--accent)" : "var(--text)" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Section — a heading + a body, no card ──────────────────────────────── */

export function SectionCard({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title && <h2>{title}</h2>}
      <div>{children}</div>
    </section>
  );
}

/* ─── Button ─────────────────────────────────────────────────────────────── */

type ButtonTone = "primary" | "secondary" | "danger" | "warning" | "neutral";

export function Btn({
  tone = "secondary",
  disabled,
  loading,
  children,
  onClick,
  type = "button",
  className = "",
}: {
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  const isPrimary = tone === "primary" || tone === "danger";
  const isWarning = tone === "warning";

  const background = isPrimary
    ? "var(--accent)"
    : isWarning
      ? "var(--bg-subtle)"
      : "var(--bg-subtle)";
  const color = isPrimary
    ? "#ffffff"
    : isWarning
      ? "var(--status-warning)"
      : "var(--text-2)";
  const borderColor = isPrimary
    ? "var(--accent)"
    : isWarning
      ? "var(--status-warning)"
      : "var(--border-2)";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center px-3 py-1.5 text-sm font-medium border disabled:opacity-50 ${className}`}
      style={{ background, color, borderColor }}
    >
      {loading ? "Working…" : children}
    </button>
  );
}

/* ─── Loading state ──────────────────────────────────────────────────────── */

export function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  return (
    <main className="flex-1 flex items-center justify-center">
      <p style={{ color: "var(--text-muted)" }}>{message}</p>
    </main>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <div
      className="border-l-2 pl-4 py-2"
      style={{ borderColor: "var(--border-2)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
        {title}
      </p>
      {body && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {body}
        </p>
      )}
    </div>
  );
}
