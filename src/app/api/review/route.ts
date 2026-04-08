import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { getReviewQueue } from "@/lib/review/queue";

/**
 * GET /api/review
 *
 * Returns the signed-in user's operator-review queue items.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await getReviewQueue(userId);
  return NextResponse.json(items);
}
