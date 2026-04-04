import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";
import { z } from "zod";

const UpdateSchema = z.object({
  status: z.enum(["completed", "dismissed"]),
});

/**
 * PATCH /api/tasks/:id
 *
 * Mark a task as completed or dismissed. Only the task owner can update.
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

  const task = await prisma.userTask.findUnique({ where: { id } });
  if (!task || task.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status === "completed" || task.status === "dismissed") {
    return NextResponse.json({ error: "Task already resolved" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.userTask.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json(updated);
}
