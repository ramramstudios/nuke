import type { PlaywrightRunResult } from "@/lib/automation/session";
import { runPlaywrightAutomationSession } from "@/lib/automation/session";
import {
  type BrokerFormAutomationInput,
  type BrokerFormAutomationResult,
  type FormAutomationOutcome,
} from "@/lib/automation/types";
import { WAVE_ONE_BROKER_FORM_RUNNERS } from "@/lib/automation/wave-one-runners";

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

const BROKER_FORM_RUNNERS = WAVE_ONE_BROKER_FORM_RUNNERS;

export function hasBrokerFormRunner(brokerName: string): boolean {
  return normalizeBrokerKey(brokerName) in BROKER_FORM_RUNNERS;
}

export function listRegisteredFormAutomationBrokers(): string[] {
  return Object.keys(BROKER_FORM_RUNNERS).sort();
}

export async function runBrokerFormAutomation(
  input: BrokerFormAutomationInput
): Promise<BrokerFormAutomationResult> {
  const runner = BROKER_FORM_RUNNERS[normalizeBrokerKey(input.brokerName)];
  if (!runner) {
    throw new FormAutomationNotImplementedError(input.brokerName);
  }

  let outcome: FormAutomationOutcome = { status: "submitted" };

  const run = await runPlaywrightAutomationSession(
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

      outcome =
        (await runner({
          ...context,
          input,
        })) ?? outcome;
      context.recordDetail("resultStatus", outcome.status);
      if (outcome.blockerType) {
        context.recordDetail("resultBlockerType", outcome.blockerType);
      }
      if (outcome.reason) {
        context.recordDetail("resultReason", outcome.reason);
      }
      if (outcome.removalUrl) {
        context.recordDetail("resultRemovalUrl", outcome.removalUrl);
      }
    }
  );

  if (run.status === "failed") {
    throw new Error(
      `Form automation failed for ${input.brokerName}. Artifacts: ${run.runDir}. ${run.errorMessage ?? "Unknown error."}`
    );
  }

  return {
    outcome,
    run,
  };
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
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
