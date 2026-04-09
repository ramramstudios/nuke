import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { submitDeletionRequest } from "@/lib/dispatcher/dispatch";
import { processAllPending } from "@/lib/removal/engine";
import { isFormAutomationEnabled } from "@/lib/automation/config";
import { getComplianceSummary, getDetailedStatus } from "@/lib/compliance/tracker";

/** POST: Submit a new centralized deletion request */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await submitDeletionRequest(userId);
  const methods = isFormAutomationEnabled() ? ["email", "form"] : ["email"];
  const processed = await processAllPending(result.deletionRequestId, {
    methods,
  });

  return NextResponse.json({
    ...result,
    processedMethods: methods,
    processedRequests: processed.processed,
  });
}

/** GET: Get compliance summary + detailed broker statuses */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const detail = req.nextUrl.searchParams.get("detail");

  if (detail === "true") {
    const statuses = await getDetailedStatus(userId);
    return NextResponse.json(statuses);
  }

  const summary = await getComplianceSummary(userId);
  return NextResponse.json(summary);
}
