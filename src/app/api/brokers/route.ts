import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const brokers = await prisma.broker.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      domain: true,
      category: true,
      removalMethod: true,
      slaInDays: true,
      tier: true,
    },
  });

  return NextResponse.json(brokers);
}
