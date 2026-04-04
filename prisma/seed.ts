import { PrismaClient } from "@prisma/client";
import { BROKER_SEEDS } from "../src/lib/brokers/registry";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding broker registry…");

  for (const seed of BROKER_SEEDS) {
    await prisma.broker.upsert({
      where: { name: seed.name },
      update: {
        domain: seed.domain,
        category: seed.category,
        searchMethod: seed.searchMethod,
        removalMethod: seed.removalMethod,
        removalEndpoint: seed.removalEndpoint,
        slaInDays: seed.slaInDays,
        tier: seed.tier,
        notes: seed.notes ?? null,
      },
      create: {
        name: seed.name,
        domain: seed.domain,
        category: seed.category,
        searchMethod: seed.searchMethod,
        removalMethod: seed.removalMethod,
        removalEndpoint: seed.removalEndpoint,
        slaInDays: seed.slaInDays,
        tier: seed.tier,
        notes: seed.notes ?? null,
      },
    });
  }

  await prisma.broker.updateMany({
    where: { name: "PeopleFinder" },
    data: {
      active: false,
      notes:
        "Legacy broker entry replaced by PeopleFinders web opt-out flow on peoplefinders.com/opt-out.",
    },
  });

  await prisma.broker.updateMany({
    where: { name: "USSearch" },
    data: {
      active: false,
      notes:
        "Excluded from the vetted email broker set pending verification of the official PeopleConnect suppression flow for USSearch.",
    },
  });

  await prisma.broker.updateMany({
    where: { name: "Datalogix" },
    data: {
      active: false,
      notes:
        "Retired standalone broker entry. Datalogix was acquired by Oracle and the datalogix.com consumer mailbox/domain is no longer valid.",
    },
  });

  console.log(`Seeded ${BROKER_SEEDS.length} brokers.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
