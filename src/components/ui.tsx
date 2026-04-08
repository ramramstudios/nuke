/**
 * Lightweight shared UI primitives for the dashboard surfaces.
 * All components use CSS variables so they adapt to both dark and light themes.
 */

import type { ReactNode } from "react";

/* ─── Page shell ─────────────────────────────────────────────────────────── */

export function PageContent({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`flex-1 w-full mx-auto px-4 sm:px-6 py-8 space-y-8 ${wide ? "max-w-7xl" : "max-w-6xl"}`}
    >
      {children}
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
        {detail && (
          <p className="mt-1.5 text-xs" style={{ color: "var(--text-faint)" }}>
            {detail}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ─── Error / feedback banners ───────────────────────────────────────────── */

type BannerTone = "error" | "warning" | "success" | "info";

const BANNER_STYLES: Record<BannerTone, { bg: string; border: string; text: string }> = {
  error:   { bg: "rgba(127,29,29,0.15)",  border: "rgba(153,27,27,0.5)",  text: "#fca5a5" },
  warning: { bg: "rgba(120,53,15,0.15)",  border: "rgba(146,64,14,0.5)",  text: "#fcd34d" },
  success: { bg: "rgba(6,78,59,0.15)",    border: "rgba(6,95,70,0.5)",    text: "#6ee7b7" },
  info:    { bg: "rgba(30,58,138,0.15)",  border: "rgba(30,64,175,0.5)",  text: "#93c5fd" },
};

export function Banner({ tone = "error", children }: { tone?: BannerTone; children: ReactNode }) {
  const s = BANNER_STYLES[tone];
  return (
    <div
      role="alert"
      className="rounded-xl px-4 py-3 text-sm border"
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {children}
    </div>
  );
}

/* ─── Stat / metric card ─────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  accent = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div
        className={compact ? "text-sm font-semibold" : "text-2xl font-bold"}
        style={{ color: accent ? "var(--accent)" : "var(--text)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Section card ───────────────────────────────────────────────────────── */

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
    <section
      className={`rounded-xl border ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {title && (
        <div
          className="px-5 py-3 border-b text-xs font-semibold uppercase tracking-widest"
          style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
        >
          {title}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ─── Button variants ────────────────────────────────────────────────────── */

type ButtonTone = "primary" | "secondary" | "danger" | "warning" | "neutral";

const BTN: Record<ButtonTone, { bg: string; hover: string; text: string; border?: string }> = {
  primary:   { bg: "var(--accent)",    hover: "var(--accent-hover)", text: "#fff" },
  secondary: { bg: "var(--surface)",   hover: "var(--surface-2)",    text: "var(--text-2)", border: "var(--border)" },
  danger:    { bg: "var(--accent)",    hover: "var(--accent-hover)", text: "#fff" },
  warning:   { bg: "rgba(120,53,15,0.4)", hover: "rgba(146,64,14,0.5)", text: "#fcd34d", border: "rgba(146,64,14,0.6)" },
  neutral:   { bg: "var(--surface-2)", hover: "var(--border)",       text: "var(--text-muted)", border: "var(--border)" },
};

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
  const s = BTN[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border ${className}`}
      style={{
        background: s.bg,
        color: s.text,
        borderColor: s.border ?? "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) (e.currentTarget as HTMLElement).style.background = s.hover;
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) (e.currentTarget as HTMLElement).style.background = s.bg;
      }}
    >
      {loading ? "Working…" : children}
    </button>
  );
}

/* ─── Loading state ──────────────────────────────────────────────────────── */

export function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  return (
    <main className="flex-1 flex items-center justify-center">
      <p style={{ color: "var(--text-faint)" }}>{message}</p>
    </main>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div
      className="rounded-xl border border-dashed px-6 py-16 text-center"
      style={{ borderColor: "var(--border-2)" }}
    >
      <p className="text-base font-medium" style={{ color: "var(--text-2)" }}>
        {title}
      </p>
      {body && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-faint)" }}>
          {body}
        </p>
      )}
    </div>
  );
}
