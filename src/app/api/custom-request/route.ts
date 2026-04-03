import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";

const schema = z.object({
  targetUrl: z.string().url(),
  notes: z.string().optional(),
});

/** POST: Submit a custom removal request for an arbitrary URL */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Attempt to discover the privacy/removal page
  const domain = new URL(parsed.data.targetUrl).hostname;
  const removalUrl = `https://${domain}/privacy`; // MVP: naive pattern

  const request = await prisma.customRequest.create({
    data: {
      userId,
      targetUrl: parsed.data.targetUrl,
      notes: parsed.data.notes,
      removalUrl,
      status: "requires_user_action",
    },
  });

  return NextResponse.json(request, { status: 201 });
}

/** GET: List user's custom requests */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await prisma.customRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}
