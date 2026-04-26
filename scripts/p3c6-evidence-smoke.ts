import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { persistFormAutomationEvidence } from "@/lib/automation/evidence";
import { encryptJSON } from "@/lib/crypto/encrypt";
import { getRequestTimeline } from "@/lib/compliance/timeline";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const runId = `p3c6-evidence-${suffix}`;
  const runDir = path.join(process.cwd(), ".artifacts", "p3c6-smoke", runId);
  const screenshotsDir = path.join(runDir, "screenshots");
  const logPath = path.join(runDir, "automation-log.json");
  const metadataPath = path.join(runDir, "metadata.json");
  const tracePath = path.join(runDir, "trace.zip");
  const screenshots = [
    path.join(screenshotsDir, "01-matched-profile.png"),
    path.join(screenshotsDir, "02-blocker.png"),
  ];

  await fs.mkdir(screenshotsDir, { recursive: true });
  await Promise.all([
    fs.writeFile(logPath, "[]", "utf8"),
    fs.writeFile(metadataPath, JSON.stringify({ runId }, null, 2), "utf8"),
    fs.writeFile(tracePath, "trace placeholder", "utf8"),
    ...screenshots.map((screenshot) => fs.writeFile(screenshot, "", "utf8")),
  ]);

  const user = await prisma.user.create({
    data: {
      email: `p3c6-smoke-${suffix}@example.com`,
      passwordHash: "smoke-test",
      verified: true,
    },
  });

  try {
    const broker = await prisma.broker.findUnique({
      where: { name: "Spokeo" },
    });

    if (!broker) {
      throw new Error("Spokeo broker is required for P3C6 smoke.");
    }

    const payloadSnapshot = createRemovalProfileSnapshot({
      fullNames: encryptJSON(["Jane Evidence"]),
      emails: encryptJSON(["jane.evidence@example.com"]),
      phones: encryptJSON(["2025550188"]),
      addresses: encryptJSON([
        {
          city: "Austin",
          state: "TX",
          street: "1 Evidence St",
          zip: "78701",
        },
      ]),
      advertisingIds: encryptJSON([]),
      vin: null,
    });

    const deletionRequest = await prisma.deletionRequest.create({
      data: {
        payloadSnapshot,
        status: "active",
        userId: user.id,
      },
    });

    const removalRequest = await prisma.removalRequest.create({
      data: {
        brokerId: broker.id,
        deletionRequestId: deletionRequest.id,
        method: "form",
        removalUrl: "https://www.spokeo.com/optout?url=example",
        status: "requires_user_action",
      },
    });

    const startedAt = new Date(Date.now() - 5_000).toISOString();
    const finishedAt = new Date().toISOString();

    await persistFormAutomationEvidence({
      removalRequestId: removalRequest.id,
      result: {
        outcome: {
          blockerType: "captcha",
          reason:
            "Spokeo reached the prefilled opt-out page, but the final submit is blocked by a live CAPTCHA challenge.",
          removalUrl: "https://www.spokeo.com/optout?url=example",
          status: "requires_user_action",
        },
        run: {
          brokerDomain: broker.domain,
          brokerName: broker.name,
          entryUrl: broker.removalEndpoint ?? "https://www.spokeo.com/optout",
          errorMessage: null,
          finalUrl: "https://www.spokeo.com/optout?url=example",
          finishedAt,
          logEntries: 2,
          logPath,
          metadataPath,
          pageTitle: "Spokeo Opt Out",
          runDir,
          runId,
          screenshots,
          startedAt,
          status: "succeeded",
          tracePath,
        },
      },
    });

    const evidence = await prisma.automationEvidence.findUnique({
      where: { runId },
    });

    if (!evidence) {
      throw new Error("Automation evidence was not persisted.");
    }

    const timeline = await getRequestTimeline(removalRequest.id, user.id);
    const evidenceEvent = timeline?.find((event) => event.type === "automation_evidence");

    if (!evidenceEvent) {
      throw new Error("Automation evidence did not appear in the request timeline.");
    }

    if (evidenceEvent.metadata?.screenshotCount !== screenshots.length) {
      throw new Error("Timeline evidence screenshot count did not match persisted evidence.");
    }

    console.log(
      JSON.stringify(
        {
          evidence: {
            blockerType: evidence.blockerType,
            logPath: evidence.logPath,
            runDir: evidence.runDir,
            runId: evidence.runId,
            screenshotCount: evidence.screenshotCount,
            tracePath: evidence.tracePath,
          },
          timelineEvent: {
            metadata: evidenceEvent.metadata,
            title: evidenceEvent.title,
            type: evidenceEvent.type,
          },
        },
        null,
        2
      )
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Phase 3 Chunk 6 evidence smoke failed";
  console.error("[nuke][p3c6-evidence-smoke]", { error: message });
  process.exit(1);
});
