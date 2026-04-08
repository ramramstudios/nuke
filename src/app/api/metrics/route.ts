import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { getSuccessMetricsReport } from "@/lib/reporting/metrics";

/**
 * GET /api/metrics
 *
 * Returns broker success metrics and SLA reporting for the signed-in user.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await getSuccessMetricsReport(userId);
  return NextResponse.json(report);
}
