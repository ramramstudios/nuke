import { prisma } from "@/lib/db";
import {
  listRegisteredFormAutomationBrokers,
  runFormAutomationFoundationSmoke,
} from "@/lib/automation/form-runners";
import type { PlaywrightRunResult } from "@/lib/automation/session";

export const DEFAULT_FORM_SMOKE_TEST_BROKER = "Spokeo";

export interface FormFoundationSmokeTestInput {
  brokerName?: string;
}

export interface FormFoundationSmokeTestResult {
  brokerDomain: string;
  brokerName: string;
  entryUrl: string;
  registeredFormAutomations: string[];
  run: PlaywrightRunResult;
}

export async function listFormSmokeTestBrokers(): Promise<
  Array<{ domain: string; entryUrl: string; name: string }>
> {
  const brokers = await prisma.broker.findMany({
    where: {
      active: true,
      removalMethod: "form",
      removalEndpoint: { not: null },
    },
    orderBy: { name: "asc" },
  });

  return brokers
    .filter(
      (broker): broker is typeof broker & { removalEndpoint: string } =>
        typeof broker.removalEndpoint === "string" &&
        broker.removalEndpoint.length > 0
    )
    .map((broker) => ({
      domain: broker.domain,
      entryUrl: broker.removalEndpoint,
      name: broker.name,
    }));
}

export async function runFormFoundationSmokeTest(
  input: FormFoundationSmokeTestInput
): Promise<FormFoundationSmokeTestResult> {
  const brokerName = (input.brokerName || DEFAULT_FORM_SMOKE_TEST_BROKER).trim();
  const broker = await findFormBrokerByName(brokerName);

  if (!broker) {
    const available = await listFormSmokeTestBrokers();
    const options = available.map((item) => item.name).join(", ");
    throw new Error(
      `Form broker "${brokerName}" was not found. Available form brokers: ${options}`
    );
  }

  if (!broker.removalEndpoint) {
    throw new Error(
      `Broker "${broker.name}" does not have a form removal endpoint configured.`
    );
  }

  const run = await runFormAutomationFoundationSmoke({
    brokerDomain: broker.domain,
    brokerName: broker.name,
    entryUrl: broker.removalEndpoint,
  });

  return {
    brokerDomain: broker.domain,
    brokerName: broker.name,
    entryUrl: broker.removalEndpoint,
    registeredFormAutomations: listRegisteredFormAutomationBrokers(),
    run,
  };
}

async function findFormBrokerByName(name: string) {
  const brokers = await prisma.broker.findMany({
    where: {
      active: true,
      removalMethod: "form",
      removalEndpoint: { not: null },
    },
  });

  return (
    brokers.find(
      (broker) => broker.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}
