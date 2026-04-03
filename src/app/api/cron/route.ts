import { NextRequest, NextResponse } from "next/server";
import { runMaintenanceCycle } from "@/lib/jobs/scheduler";

/**
 * Maintenance endpoint — call via external cron (e.g. Vercel Cron, Railway, etc.)
 *
 * Protects with a simple bearer token check.
 * Set CRON_SECRET in your env to enable this.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runMaintenanceCycle();
  return NextResponse.json(result);
}
