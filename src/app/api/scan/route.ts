import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { runScan } from "@/lib/crawler/scanner";
import { prisma } from "@/lib/db";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runScan(userId);
  return NextResponse.json(result);
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scans = await prisma.scan.findMany({
    where: { userId },
    include: {
      exposures: { include: { broker: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(scans);
}
