import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, verified: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const hasProfile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  return NextResponse.json({ ...user, hasProfile: !!hasProfile });
}
