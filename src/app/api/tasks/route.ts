import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";

/**
 * GET /api/tasks
 *
 * Returns the current user's actionable tasks (status = pending).
 * pending_review tasks are not shown to users — they are for the
 * future operator review queue. Pass ?all=true to include
 * completed/dismissed tasks.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const showAll = url.searchParams.get("all") === "true";

  const tasks = await prisma.userTask.findMany({
    where: {
      userId,
      ...(!showAll && { status: "pending" }),
    },
    include: {
      broker: { select: { name: true, domain: true } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks);
}
