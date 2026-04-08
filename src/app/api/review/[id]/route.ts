import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/jwt";
import { resolveReviewItem } from "@/lib/review/queue";

const ResolveReviewItemSchema = z.object({
  action: z.enum([
    "mark_acknowledged",
    "mark_completed",
    "mark_rejected",
    "request_user_action",
    "dismiss_noise",
  ]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * PATCH /api/review/:id
 *
 * Resolves one review-queue item through supported operator actions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ResolveReviewItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await resolveReviewItem(userId, id, parsed.data);
    return NextResponse.json({ status: "resolved" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not resolve the review item.",
      },
      { status: 400 }
    );
  }
}
