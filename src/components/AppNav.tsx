"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";

const NAV_LINKS = [
  { href: "/dashboard",                  label: "Dashboard" },
  { href: "/dashboard/scans",            label: "Scans" },
  { href: "/dashboard/review",           label: "Review" },
  { href: "/dashboard/metrics",          label: "Metrics" },
  { href: "/dashboard/plan",             label: "Plan" },
  { href: "/dashboard/managed-service",  label: "Concierge" },
  { href: "/dashboard/profile",          label: "Profile" },
] as const;

interface SessionUser {
  email: string;
  hasProfile: boolean;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options: { value: "dark" | "light" | "system"; label: string; icon: string }[] = [
    { value: "dark",   label: "Dark",   icon: "🌙" },
    { value: "light",  label: "Light",  icon: "☀️" },
    { value: "system", label: "System", icon: "💻" },
  ];

  const current = options.find((o) => o.value === theme) ?? options[0];
  const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const next = options.find((o) => o.value === nextTheme) ?? options[0];

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      title={`Switch to ${next.label} mode`}
      aria-label={`Current theme: ${current.label}. Switch to ${next.label}`}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        border: "1px solid var(--border)",
      }}
    >
      <span aria-hidden="true">{current.icon}</span>
      <span className="hidden sm:inline">{current.label}</span>
    </button>
  );
}

export function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const payload = await parseJsonResponse<SessionUser>(res);

      if (cancelled) {
        return;
      }

      if (!res.ok || !payload.data) {
        setUserEmail("");
        return;
      }

      setUserEmail(payload.data.email);
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setLogoutLoading(true);

    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const payload = await parseJsonResponse<{ success?: boolean }>(res);

      if (!res.ok) {
        throw new Error(getResponseErrorMessage(payload, "Could not sign you out."));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLogoutLoading(false);
      router.replace("/onboarding");
      router.refresh();
    }
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <header
      style={{
        background: "var(--nav-bg)",
        borderBottom: "1px solid var(--nav-border)",
      }}
      className="sticky top-0 z-40"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-14 gap-4">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex-shrink-0 text-base font-bold tracking-tight"
            style={{ color: "var(--accent)" }}
          >
            NUKE
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1" aria-label="Main navigation">
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: active ? "var(--surface-2)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "var(--surface)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-2)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    }
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            {userEmail && (
              <span
                className="hidden lg:block text-xs max-w-[180px] truncate"
                style={{ color: "var(--text-faint)" }}
                title={userEmail}
              >
                {userEmail}
              </span>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              className="hidden sm:flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--surface)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {logoutLoading ? "Signing out…" : "Sign out"}
            </button>

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <span
                className="block w-5 h-0.5 transition-transform"
                style={{
                  background: "currentColor",
                  transform: menuOpen ? "translateY(8px) rotate(45deg)" : "",
                }}
              />
              <span
                className="block w-5 h-0.5 transition-opacity"
                style={{
                  background: "currentColor",
                  opacity: menuOpen ? 0 : 1,
                }}
              />
              <span
                className="block w-5 h-0.5 transition-transform"
                style={{
                  background: "currentColor",
                  transform: menuOpen ? "translateY(-8px) rotate(-45deg)" : "",
                }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav panel */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="md:hidden border-t px-4 py-3 space-y-1"
          style={{
            background: "var(--nav-bg)",
            borderColor: "var(--nav-border)",
          }}
        >
          <nav aria-label="Mobile navigation">
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: active ? "var(--surface-2)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          {userEmail && (
            <p
              className="px-3 pt-2 text-xs truncate"
              style={{ color: "var(--text-faint)", borderTop: "1px solid var(--border)" }}
            >
              {userEmail}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void handleLogout();
            }}
            disabled={logoutLoading}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ color: "var(--text-muted)" }}
          >
            {logoutLoading ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </header>
  );
}
