"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Banner,
  EmptyState,
  LoadingScreen,
  PageContent,
  PageHeader,
  StatCard,
} from "@/components/ui";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";

interface ExposureRecord {
  id: string;
  sourceUrl: string;
  dataFound: string;
  confidence: number;
  broker: {
    name: string;
    domain: string;
    category: string;
  } | null;
}

interface ScanRecord {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  exposures: ExposureRecord[];
}

interface ScanPageData {
  scans: ScanRecord[];
}

export default function ScanResultsPage() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  async function fetchScanData(): Promise<ScanPageData | null> {
    const meRes = await fetch("/api/auth/me", { cache: "no-store" });
    const mePayload = await parseJsonResponse<{ email: string; hasProfile: boolean }>(meRes);

    if (!meRes.ok) {
      if (meRes.status === 401) {
        return null;
      }

      throw new Error(
        getResponseErrorMessage(mePayload, "Could not load your session.")
      );
    }

    if (!mePayload.data) {
      throw new Error(
        getResponseErrorMessage(mePayload, "Could not read your session.")
      );
    }

    const me = mePayload.data;
    if (!me.hasProfile) {
      return null;
    }

    const scansRes = await fetch("/api/scan", { cache: "no-store" });
    const scansPayload = await parseJsonResponse<ScanRecord[]>(scansRes);

    if (!scansRes.ok || !scansPayload.data) {
      throw new Error(
        getResponseErrorMessage(scansPayload, "Could not load scan results.")
      );
    }

    return {
      scans: scansPayload.data,
    };
  }

  function applyScanData(data: ScanPageData) {
    setScans(data.scans);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadScans() {
      try {
        const data = await fetchScanData();
        if (cancelled) return;

        if (!data) {
          router.push("/onboarding");
          return;
        }

        setError("");
        applyScanData(data);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load scan results."
        );
        setLoading(false);
      }
    }

    void loadScans();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function refreshScans() {
    try {
      const data = await fetchScanData();
      if (!data) {
        router.push("/onboarding");
        return;
      }
      setError("");
      applyScanData(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not refresh scan results."
      );
    }
  }

  async function handleRunScan() {
    setActionLoading("scan");
    setError("");

    const res = await fetch("/api/scan", { method: "POST" });
    if (!res.ok) {
      const payload = await parseJsonResponse<{ error?: string }>(res);
      setError(getResponseErrorMessage(payload, "Scan failed"));
      setActionLoading("");
      return;
    }

    setActionLoading("");
    await refreshScans();
  }

  const totalExposures = scans.reduce((sum, scan) => sum + scan.exposures.length, 0);
  const latestExposureCount = scans[0]?.exposures.length ?? 0;
  const latestCompletedAt = scans[0]?.completedAt ?? scans[0]?.createdAt ?? null;

  if (loading) {
    return <LoadingScreen message="Loading scan results…" />;
  }

  return (
    <PageContent>
        <PageHeader
          title="Scan Results"
          subtitle="Discovery is still simulated in this phase, but every run writes real scan and exposure rows to the database."
          actions={
            <button
              onClick={handleRunScan}
              disabled={!!actionLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors text-white"
              style={{ background: "var(--accent)" }}
            >
              {actionLoading === "scan" ? "Scanning…" : "Run Scan Again"}
            </button>
          }
        />

        {error && <Banner tone="error">{error}</Banner>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Saved Scans" value={scans.length} />
          <StatCard label="Total Exposures" value={totalExposures} />
          <StatCard label="Latest Scan Hits" value={latestExposureCount} />
          <StatCard
            label="Last Completed"
            value={latestCompletedAt ? formatDate(latestCompletedAt) : "Never"}
            compact
          />
        </div>

        {scans.length === 0 ? (
          <EmptyState
            title="No scans yet."
            body="Run your first scan to generate simulated broker exposure results."
          />
        ) : (
          <section className="space-y-6">
            {scans.map((scan) => (
              <article
                key={scan.id}
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="px-5 py-4 border-b"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                          Scan {formatDateTime(scan.createdAt)}
                        </h2>
                        <StatusBadge status={scan.status} />
                      </div>
                      <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                        {scan.exposures.length} exposure
                        {scan.exposures.length === 1 ? "" : "s"} found
                      </p>
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-faint)" }}>
                      {scan.completedAt
                        ? `Completed ${formatDateTime(scan.completedAt)}`
                        : scan.startedAt
                          ? `Started ${formatDateTime(scan.startedAt)}`
                          : "Pending"}
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  {scan.exposures.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                      No simulated exposures were found in this scan.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {scan.exposures.map((exposure) => (
                        <div
                          key={exposure.id}
                          className="rounded-lg border p-4"
                          style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-medium" style={{ color: "var(--text)" }}>
                                {exposure.broker?.name || "Unknown broker"}
                              </h3>
                              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                                {(exposure.broker?.category || "other").replace(/_/g, " ")}{" "}
                                · {exposure.broker?.domain || "unknown domain"}
                              </p>
                            </div>
                            <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                              Confidence {Math.round(exposure.confidence * 100)}%
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {formatDetectedData(exposure.dataFound).map((item) => (
                              <span
                                key={`${exposure.id}-${item}`}
                                className="inline-flex rounded-full px-2.5 py-1 text-xs border"
                                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
                              >
                                {item}
                              </span>
                            ))}
                          </div>

                          <div className="mt-4">
                            <a
                              href={exposure.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm underline"
                              style={{ color: "var(--accent)" }}
                            >
                              Open simulated source →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </PageContent>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDetectedData(dataFound: string): string[] {
  try {
    const parsed = JSON.parse(dataFound) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, value]) => value !== false && value !== null && value !== "")
      .map(([key, value]) => {
        const label = key.replace(/_/g, " ");
        if (value === true) {
          return `${label} detected`;
        }
        if (Array.isArray(value)) {
          return `${label}: ${value.join(", ")}`;
        }
        if (typeof value === "object") {
          return `${label}: ${JSON.stringify(value)}`;
        }
        return `${label}: ${String(value)}`;
      });
  } catch {
    return ["Detected data unavailable"];
  }
}
