import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/jwt";
import {
  cancelActiveSelfServePlan,
  getSelfServePlanDashboardData,
  selectSelfServePlan,
} from "@/lib/plans/service";

const SelectPlanSchema = z.object({
  planKey: z.enum(["free-self-serve", "assisted-self-serve", "concierge-managed"]),
  acknowledgedChoreScope: z.boolean(),
  acknowledgedManagedHandoff: z.boolean(),
  notes: z.string().max(1000).optional(),
});

const PatchSchema = z.object({
  action: z.literal("cancel"),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getSelfServePlanDashboardData(userId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SelectPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await selectSelfServePlan(userId, parsed.data);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not select the requested self-serve plan.",
      },
      { status: 409 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = await cancelActiveSelfServePlan(userId);
  return NextResponse.json(data);
}
