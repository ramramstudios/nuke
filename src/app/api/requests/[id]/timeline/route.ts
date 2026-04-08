import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { getRequestTimeline } from "@/lib/compliance/timeline";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const timeline = await getRequestTimeline(id, userId);

  if (!timeline) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json(timeline);
}
