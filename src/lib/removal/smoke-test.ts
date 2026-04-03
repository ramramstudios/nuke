import { prisma } from "@/lib/db";
import { processRemoval } from "@/lib/removal/engine";
import { createRemovalProfileSnapshot } from "@/lib/removal/profile";

export const DEFAULT_SMOKE_TEST_BROKER = "PeopleFinder";

export interface EmailSmokeTestInput {
  userEmail: string;
  brokerName?: string;
}

export interface EmailSmokeTestResult {
  deletionRequestId: string;
  removalRequestId: string;
  brokerName: string;
  brokerEmail: string;
  providerMessageId: string;
  sentAt: string;
  status: string;
  submittedAt: string;
}

export async function listEmailSmokeTestBrokers(): Promise<
  Array<{ name: string; removalEndpoint: string }>
> {
  const brokers = await prisma.broker.findMany({
    where: {
      active: true,
      removalMethod: "email",
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
      name: broker.name,
      removalEndpoint: broker.removalEndpoint,
    }));
}

export async function runEmailSmokeTest(
  input: EmailSmokeTestInput
): Promise<EmailSmokeTestResult> {
  ensureLiveEmailMode();

  const userEmail = input.userEmail.trim().toLowerCase();
  if (!userEmail) {
    throw new Error("A smoke test user email is required");
  }

  const brokerName = (input.brokerName || DEFAULT_SMOKE_TEST_BROKER).trim();
  const broker = await findEmailBrokerByName(brokerName);
  if (!broker) {
    const available = await listEmailSmokeTestBrokers();
    const options = available.map((item) => item.name).join(", ");
    throw new Error(
      `Email broker "${brokerName}" was not found. Available brokers: ${options}`
    );
  }

  const user = await findUserWithProfileByEmail(userEmail);
  if (!user?.profile) {
    throw new Error(
      `No onboarded user profile found for ${userEmail}. Create an account and complete onboarding first.`
    );
  }

  const payloadSnapshot = createRemovalProfileSnapshot(user.profile);

  const deletionRequest = await prisma.deletionRequest.create({
    data: {
      userId: user.id,
      payloadSnapshot,
      status: "dispatching",
    },
  });

  const removalRequest = await prisma.removalRequest.create({
    data: {
      deletionRequestId: deletionRequest.id,
      brokerId: broker.id,
      method: "email",
      status: "pending",
      deadline: new Date(
        Date.now() + broker.slaInDays * 24 * 60 * 60 * 1000
      ),
    },
  });

  await prisma.deletionRequest.update({
    where: { id: deletionRequest.id },
    data: { status: "active" },
  });

  await processRemoval(removalRequest.id);

  const processed = await prisma.removalRequest.findUnique({
    where: { id: removalRequest.id },
    include: { broker: true },
  });

  if (!processed) {
    throw new Error("Smoke test request disappeared before verification");
  }

  if (processed.status !== "submitted") {
    const reason = processed.lastError
      ? ` Provider error: ${processed.lastError}`
      : "";
    throw new Error(
      `Smoke test did not reach submitted status. Current status: ${processed.status}.${reason}`
    );
  }

  if (!processed.providerMessageId) {
    throw new Error("Smoke test completed without a provider message id");
  }

  if (processed.providerMessageId.startsWith("dryrun_")) {
    throw new Error(
      "Smoke test ran in dry-run mode. Set EMAIL_DELIVERY_MODE=resend before retrying."
    );
  }

  if (!processed.sentAt || !processed.submittedAt) {
    throw new Error("Smoke test did not persist sent/submitted timestamps");
  }

  return {
    deletionRequestId: deletionRequest.id,
    removalRequestId: processed.id,
    brokerName: processed.broker.name,
    brokerEmail: processed.broker.removalEndpoint ?? "unknown",
    providerMessageId: processed.providerMessageId,
    sentAt: processed.sentAt.toISOString(),
    status: processed.status,
    submittedAt: processed.submittedAt.toISOString(),
  };
}

function ensureLiveEmailMode() {
  if (process.env.EMAIL_DELIVERY_MODE !== "resend") {
    throw new Error(
      "EMAIL_DELIVERY_MODE must be set to resend for the live smoke test"
    );
  }

  if (!process.env.EMAIL_FROM || !process.env.EMAIL_FROM.includes("@")) {
    throw new Error(
      "EMAIL_FROM must be a verified sender address for the live smoke test"
    );
  }

  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY must be set for the live smoke test"
    );
  }
}

async function findEmailBrokerByName(name: string) {
  const brokers = await prisma.broker.findMany({
    where: {
      active: true,
      removalMethod: "email",
      removalEndpoint: { not: null },
    },
  });

  return (
    brokers.find(
      (broker) => broker.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}

async function findUserWithProfileByEmail(email: string) {
  const users = await prisma.user.findMany({
    include: { profile: true },
  });

  return users.find((user) => user.email.toLowerCase() === email) ?? null;
}
