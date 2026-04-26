import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { enqueueAutomationJobsForDeletionRequest } from "@/lib/automation/queue";
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
  const formAutomationEnabled = isFormAutomationEnabled();
  const methods = ["email"];
  const processed = await processAllPending(result.deletionRequestId, {
    methods,
  });
  const automationQueue = formAutomationEnabled
    ? await enqueueAutomationJobsForDeletionRequest(result.deletionRequestId)
    : { enqueued: 0, existing: 0, skipped: 0 };

  return NextResponse.json({
    ...result,
    automationQueue,
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
