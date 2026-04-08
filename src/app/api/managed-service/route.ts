import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/jwt";
import {
  createManagedServiceEnrollment,
  getManagedServiceDashboardData,
  updateManagedServiceEnrollment,
} from "@/lib/managed-service/service";

const CreateEnrollmentSchema = z.object({
  contactPreference: z.enum(["email", "dashboard"]),
  preferredStartWindow: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
  acceptScope: z.literal(true),
  acceptManualBilling: z.literal(true),
  acceptSupportWorkflow: z.literal(true),
});

const UpdateEnrollmentSchema = z.object({
  action: z.enum(["mark_payment_sent", "cancel"]),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getManagedServiceDashboardData(userId);
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

  const parsed = CreateEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await createManagedServiceEnrollment(userId, parsed.data);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not reserve the concierge pilot package.",
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

  const parsed = UpdateEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await updateManagedServiceEnrollment(userId, parsed.data.action);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update the concierge pilot enrollment.",
      },
      { status: 409 }
    );
  }
}
