/**
 * Discovery / Crawling Engine
 *
 * Scans for user PII exposure across known broker sites.
 * MVP uses simulated results; production would use headless browsing + search APIs.
 */

import { prisma } from "@/lib/db";
import { decryptJSON } from "@/lib/crypto/encrypt";

interface ScanResult {
  scanId: string;
  exposuresFound: number;
}

/**
 * Run a full scan for a user — checks each active broker for PII exposure.
 */
export async function runScan(userId: string): Promise<ScanResult> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw new Error("User profile required before scanning");

  const scan = await prisma.scan.create({
    data: { userId, status: "running", startedAt: new Date() },
  });

  const brokers = await prisma.broker.findMany({ where: { active: true } });

  // Decrypt user PII for search
  const names = decryptJSON<string[]>(profile.fullNames);
  const emails = decryptJSON<string[]>(profile.emails);
  const phones = decryptJSON<string[]>(profile.phones);

  const exposures: {
    scanId: string;
    brokerId: string;
    sourceUrl: string;
    dataFound: string;
    confidence: number;
  }[] = [];

  for (const broker of brokers) {
    // MVP: simulate discovery with probability based on broker type
    const found = simulateDiscovery(broker.category);
    if (found) {
      const detectedData = buildDetectedData(
        broker.category,
        names,
        emails,
        phones
      );
      exposures.push({
        scanId: scan.id,
        brokerId: broker.id,
        sourceUrl: `https://${broker.domain}/profile/simulated`,
        dataFound: JSON.stringify(detectedData),
        confidence: 0.6 + Math.random() * 0.35,
      });
    }
  }

  if (exposures.length > 0) {
    await prisma.exposure.createMany({ data: exposures });
  }

  await prisma.scan.update({
    where: { id: scan.id },
    data: { status: "completed", completedAt: new Date() },
  });

  return { scanId: scan.id, exposuresFound: exposures.length };
}

/** Simulate whether a broker has user data (MVP placeholder) */
function simulateDiscovery(category: string): boolean {
  const rates: Record<string, number> = {
    people_search: 0.7,
    data_broker: 0.5,
    marketing: 0.3,
    analytics: 0.2,
    other: 0.1,
  };
  return Math.random() < (rates[category] ?? 0.2);
}

/** Build a mock set of detected PII based on broker type */
function buildDetectedData(
  category: string,
  names: string[],
  emails: string[],
  phones: string[]
) {
  const base: Record<string, unknown> = { name: names[0] };

  if (category === "people_search") {
    base.email = emails[0];
    base.phone = phones[0];
    base.address = true;
  } else if (category === "marketing" || category === "analytics") {
    base.email = emails[0];
  }

  return base;
}
