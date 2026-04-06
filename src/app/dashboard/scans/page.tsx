"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
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
  user: { email: string; hasProfile: boolean };
  scans: ScanRecord[];
}

export default function ScanResultsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; hasProfile: boolean } | null>(
    null
  );
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
      user: me,
      scans: scansPayload.data,
    };
  }

  function applyScanData(data: ScanPageData) {
    setUser(data.user);
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
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading scan results…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Scan Results</h1>
            <StatusBadge status={scans[0]?.status ?? "pending"} />
          </div>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
          <p className="text-gray-500 text-sm mt-2">
            Discovery is still simulated in this phase, but every run writes real
            scan and exposure rows to the database.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Back to Dashboard
          </Link>
          <button
            onClick={handleRunScan}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "scan" ? "Scanning…" : "Run Scan Again"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Saved Scans" value={scans.length} />
        <MetricCard label="Total Exposures" value={totalExposures} />
        <MetricCard label="Latest Scan Hits" value={latestExposureCount} />
        <MetricCard
          label="Last Completed"
          value={latestCompletedAt ? formatDate(latestCompletedAt) : "Never"}
          compact
        />
      </div>

      {scans.length === 0 ? (
        <div className="text-center py-16 text-gray-500 border border-dashed border-gray-800 rounded-xl">
          <p className="text-lg">No scans yet.</p>
          <p className="text-sm mt-2">
            Run your first scan to generate simulated broker exposure results.
          </p>
        </div>
      ) : (
        <section className="space-y-6">
          {scans.map((scan) => (
            <article
              key={scan.id}
              className="border border-gray-800 rounded-xl overflow-hidden"
            >
              <div className="bg-gray-950/80 border-b border-gray-800 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        Scan {formatDateTime(scan.createdAt)}
                      </h2>
                      <StatusBadge status={scan.status} />
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      {scan.exposures.length} exposure
                      {scan.exposures.length === 1 ? "" : "s"} found
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
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
                  <p className="text-sm text-gray-500">
                    No simulated exposures were found in this scan.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {scan.exposures.map((exposure) => (
                      <div
                        key={exposure.id}
                        className="rounded-lg border border-gray-800 bg-gray-950/60 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-medium">
                              {exposure.broker?.name || "Unknown broker"}
                            </h3>
                            <p className="text-sm text-gray-400 mt-1">
                              {(exposure.broker?.category || "other").replace(
                                /_/g,
                                " "
                              )}{" "}
                              · {exposure.broker?.domain || "unknown domain"}
                            </p>
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence {Math.round(exposure.confidence * 100)}%
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {formatDetectedData(exposure.dataFound).map((item) => (
                            <span
                              key={`${exposure.id}-${item}`}
                              className="inline-flex rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs text-gray-300"
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
                            className="text-sm text-red-400 hover:text-red-300 underline"
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
    </main>
  );
}

function MetricCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className={compact ? "text-sm font-semibold text-white" : "text-2xl font-bold text-white"}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
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
