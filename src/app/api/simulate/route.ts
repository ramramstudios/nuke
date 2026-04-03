import { NextResponse } from "next/server";
import { simulateBrokerResponses } from "@/lib/compliance/tracker";
import { distributeToBrokers } from "@/lib/dispatcher/dispatch";
import { prisma } from "@/lib/db";

/**
 * MVP-only: advance the simulation.
 *
 * 1. Distribute pending removals
 * 2. Simulate broker acknowledgements/completions
 */
export async function POST() {
  // Process any pending dispatches
  const active = await prisma.deletionRequest.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  for (const dr of active) {
    await distributeToBrokers(dr.id);
  }

  // Simulate broker responses
  const simulated = await simulateBrokerResponses();

  return NextResponse.json({
    dispatched: active.length,
    ...simulated,
  });
}
