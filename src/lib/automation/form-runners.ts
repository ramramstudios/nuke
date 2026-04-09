import type { PlaywrightRunResult } from "@/lib/automation/session";
import {
  runPlaywrightAutomationSession,
  type PlaywrightAutomationContext,
} from "@/lib/automation/session";
import type { RemovalProfileSnapshot } from "@/lib/removal/profile";

export interface BrokerFormAutomationInput {
  brokerDomain: string;
  brokerName: string;
  entryUrl: string;
  profile: RemovalProfileSnapshot;
  requestId: string;
}

export interface FormFoundationSmokeInput {
  brokerDomain: string;
  brokerName: string;
  entryUrl: string;
}

export class FormAutomationNotImplementedError extends Error {
  constructor(brokerName: string) {
    super(`No Playwright form automation is registered for ${brokerName} yet.`);
    this.name = "FormAutomationNotImplementedError";
  }
}

interface BrokerFormAutomationContext extends PlaywrightAutomationContext {
  input: BrokerFormAutomationInput;
}

type BrokerFormRunner = (
  context: BrokerFormAutomationContext
) => Promise<void>;

const BROKER_FORM_RUNNERS: Record<string, BrokerFormRunner> = {};

export function hasBrokerFormRunner(brokerName: string): boolean {
  return normalizeBrokerKey(brokerName) in BROKER_FORM_RUNNERS;
}

export function listRegisteredFormAutomationBrokers(): string[] {
  return Object.keys(BROKER_FORM_RUNNERS).sort();
}

export async function runBrokerFormAutomation(
  input: BrokerFormAutomationInput
): Promise<PlaywrightRunResult> {
  const runner = BROKER_FORM_RUNNERS[normalizeBrokerKey(input.brokerName)];
  if (!runner) {
    throw new FormAutomationNotImplementedError(input.brokerName);
  }

  const result = await runPlaywrightAutomationSession(
    {
      brokerDomain: input.brokerDomain,
      brokerName: input.brokerName,
      entryUrl: input.entryUrl,
      sessionLabel: `request-${input.requestId}`,
    },
    async (context) => {
      context.recordDetail("requestId", input.requestId);
      context.recordDetail("fullNameCount", input.profile.fullNames.length);
      context.recordDetail("emailCount", input.profile.emails.length);
      context.recordDetail("phoneCount", input.profile.phones.length);
      context.recordDetail("addressCount", input.profile.addresses.length);
      context.recordDetail("vinPresent", Boolean(input.profile.vin));

      await runner({
        ...context,
        input,
      });
    }
  );

  if (result.status === "failed") {
    throw new Error(
      `Form automation failed for ${input.brokerName}. Artifacts: ${result.runDir}. ${result.errorMessage ?? "Unknown error."}`
    );
  }

  return result;
}

export async function runFormAutomationFoundationSmoke(
  input: FormFoundationSmokeInput
): Promise<PlaywrightRunResult> {
  return runPlaywrightAutomationSession(
    {
      brokerDomain: input.brokerDomain,
      brokerName: input.brokerName,
      entryUrl: input.entryUrl,
      sessionLabel: "foundation-smoke",
    },
    async (context) => {
      context.log("info", "Opening broker form entry URL", {
        entryUrl: input.entryUrl,
      });

      await context.page.goto(input.entryUrl, {
        waitUntil: "domcontentloaded",
      });

      context.recordDetail("finalUrl", context.page.url());
      context.recordDetail("pageTitle", await context.page.title());
      await context.captureScreenshot("landing");
    }
  );
}

function normalizeBrokerKey(value: string): string {
  return value.trim().toLowerCase();
}
