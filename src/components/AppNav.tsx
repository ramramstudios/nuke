"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";

interface NavLink {
  href: string;
  label: string;
  /** Routes that should also light up this nav item (sub-pages of the section). */
  match?: string[];
}

const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Home", match: ["/dashboard"] },
  {
    href: "/dashboard/brokers",
    label: "Brokers",
    match: [
      "/dashboard/brokers",
      "/dashboard/metrics",
      "/dashboard/scans",
      "/dashboard/review",
    ],
  },
  {
    href: "/dashboard/account",
    label: "Account",
    match: [
      "/dashboard/account",
      "/dashboard/plan",
      "/dashboard/managed-service",
      "/dashboard/profile",
    ],
  },
];

interface SessionUser {
  email: string;
  hasProfile: boolean;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const labels: Record<typeof theme, string> = {
    dark: "Dark",
    light: "Light",
    system: "System",
  };

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      title={`Theme: ${labels[theme]}. Click for ${labels[nextTheme]}.`}
      className="text-xs underline"
      style={{ color: "var(--link)" }}
    >
      Theme: {labels[theme]}
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

  function isActive(link: NavLink) {
    const matches = link.match ?? [link.href];
    if (link.href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return matches.some((prefix) => pathname.startsWith(prefix));
  }

  return (
    <header
      style={{
        background: "var(--nav-bg)",
        borderBottom: "1px solid var(--nav-border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-12 gap-4">
          <Link
            href="/dashboard"
            className="text-base font-semibold"
            style={{ color: "var(--accent)", fontFamily: "Georgia, serif" }}
          >
            NUKE
          </Link>

          <nav
            className="hidden md:flex items-center gap-4 flex-1"
            aria-label="Main navigation"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className="text-sm"
                  style={{
                    color: active ? "var(--text)" : "var(--link)",
                    fontWeight: active ? 600 : 400,
                    textDecoration: active ? "none" : undefined,
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <ThemeToggle />

            {userEmail && (
              <span
                className="hidden lg:inline text-xs max-w-[180px] truncate"
                style={{ color: "var(--text-muted)" }}
                title={userEmail}
              >
                {userEmail}
              </span>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              className="hidden sm:inline text-xs underline disabled:opacity-50"
              style={{ color: "var(--link)" }}
            >
              {logoutLoading ? "Signing out…" : "Sign out"}
            </button>

            <button
              type="button"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden text-sm"
              style={{ color: "var(--link)" }}
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>
      </div>

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
            {NAV_LINKS.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className="block py-1.5 text-sm"
                  style={{
                    color: active ? "var(--text)" : "var(--link)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {userEmail && (
            <p
              className="pt-2 text-xs"
              style={{
                color: "var(--text-muted)",
                borderTop: "1px solid var(--border)",
              }}
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
            className="block py-1.5 text-sm underline disabled:opacity-50"
            style={{ color: "var(--link)" }}
          >
            {logoutLoading ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </header>
  );
}
