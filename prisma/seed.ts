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
      },
    });
  }

  console.log(`Seeded ${BROKER_SEEDS.length} brokers.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
