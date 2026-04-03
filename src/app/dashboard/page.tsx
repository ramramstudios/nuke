"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { SLACountdown } from "@/components/SLACountdown";

interface Summary {
  total: number;
  pending: number;
  submitted: number;
  acknowledged: number;
  completed: number;
  rejected: number;
  requiresUserAction: number;
  overdue: number;
}

interface RemovalRequest {
  id: string;
  status: string;
  method: string;
  removalUrl: string | null;
  deadline: string | null;
  submittedAt: string | null;
  broker: { name: string; domain: string; category: string };
}

interface CustomReq {
  id: string;
  targetUrl: string;
  status: string;
  removalUrl: string | null;
  createdAt: string;
}

interface DashboardData {
  user: { email: string; hasProfile: boolean };
  summary: Summary | null;
  requests: RemovalRequest[];
  customRequests: CustomReq[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; hasProfile: boolean } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [requests, setRequests] = useState<RemovalRequest[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  // Custom request form
  const [customUrl, setCustomUrl] = useState("");

  async function fetchDashboardData(): Promise<DashboardData | null> {
    const meRes = await fetch("/api/auth/me");
    if (!meRes.ok) {
      return null;
    }
    const me = await meRes.json() as { email: string; hasProfile: boolean };

    if (!me.hasProfile) {
      return null;
    }

    const [summaryRes, detailRes, customRes] = await Promise.all([
      fetch("/api/requests"),
      fetch("/api/requests?detail=true"),
      fetch("/api/custom-request"),
    ]);

    return {
      user: me,
      summary: summaryRes.ok ? await summaryRes.json() : null,
      requests: detailRes.ok ? await detailRes.json() : [],
      customRequests: customRes.ok ? await customRes.json() : [],
    };
  }

  function applyDashboardData(data: DashboardData) {
    setUser(data.user);
    setSummary(data.summary);
    setRequests(data.requests);
    setCustomRequests(data.customRequests);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const data = await fetchDashboardData();
      if (cancelled) return;
      if (!data) {
        router.push("/onboarding");
        return;
      }
      applyDashboardData(data);
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function refreshDashboard() {
    const data = await fetchDashboardData();
    if (!data) {
      router.push("/onboarding");
      return;
    }
    applyDashboardData(data);
  }

  async function handleScan() {
    setActionLoading("scan");
    await fetch("/api/scan", { method: "POST" });
    setActionLoading("");
    await refreshDashboard();
  }

  async function handleSubmitRemoval() {
    setActionLoading("remove");
    await fetch("/api/requests", { method: "POST" });
    setActionLoading("");
    await refreshDashboard();
  }

  async function handleCustomRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!customUrl) return;
    setActionLoading("custom");
    await fetch("/api/custom-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: customUrl }),
    });
    setCustomUrl("");
    setActionLoading("");
    await refreshDashboard();
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleScan}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "scan" ? "Scanning…" : "Run Scan"}
          </button>
          <button
            onClick={handleSubmitRemoval}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "remove" ? "Submitting…" : "Submit Removal"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card label="Total Requests" value={summary.total} />
          <Card label="Completed" value={summary.completed} color="text-green-400" />
          <Card label="Pending Action" value={summary.requiresUserAction} color="text-orange-400" />
          <Card label="Overdue" value={summary.overdue} color="text-red-400" />
        </div>
      )}

      {/* Broker Requests Table */}
      {requests.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Broker Requests</h2>
          <div className="border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Broker</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Method</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">SLA</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-900/50">
                    <td className="px-4 py-3 font-medium">{req.broker.name}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {req.broker.category.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{req.method}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-4 py-3">
                      <SLACountdown deadline={req.deadline} />
                    </td>
                    <td className="px-4 py-3">
                      {req.status === "requires_user_action" && req.removalUrl && (
                        <a
                          href={req.removalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-400 hover:text-red-300 underline text-xs"
                        >
                          Complete removal →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Custom Requests */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Custom Removal Request</h2>
        <form onSubmit={handleCustomRequest} className="flex gap-3 mb-4">
          <input
            type="url"
            placeholder="https://example.com/your-listing"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            required
            className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading === "custom" ? "Adding…" : "Add Request"}
          </button>
        </form>

        {customRequests.length > 0 && (
          <div className="space-y-2">
            {customRequests.map((cr) => (
              <div
                key={cr.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm"
              >
                <div className="truncate flex-1 mr-4">{cr.targetUrl}</div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={cr.status} />
                  {cr.removalUrl && (
                    <a
                      href={cr.removalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 hover:text-red-300 underline text-xs"
                    >
                      Remove →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Empty state */}
      {!summary || summary.total === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">No removal requests yet.</p>
          <p className="text-sm mt-2">
            Run a scan to discover exposed data, then submit a removal request.
          </p>
        </div>
      ) : null}
    </main>
  );
}

function Card({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
