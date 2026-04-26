import type {
  PlaywrightAutomationContext,
  PlaywrightRunResult,
} from "@/lib/automation/session";
import type { RemovalProfileSnapshot } from "@/lib/removal/profile";

export interface BrokerFormAutomationInput {
  brokerDomain: string;
  brokerName: string;
  entryUrl: string;
  profile: RemovalProfileSnapshot;
  requestId: string;
}

export type FormAutomationBlockerType =
  | "missing_profile_data"
  | "ambiguous_match"
  | "captcha"
  | "bot_check"
  | "rate_limit"
  | "confirmation_required"
  | "identity_verification"
  | "document_upload"
  | "record_selection_required"
  | "profile_url_required"
  | "unclear_submission"
  | "automation_runtime_failure"
  | "automation_gap";

export interface FormAutomationOutcome {
  status: "submitted" | "requires_user_action";
  removalUrl?: string | null;
  blockerType?: FormAutomationBlockerType | null;
  reason?: string | null;
}

export interface BrokerFormAutomationResult {
  outcome: FormAutomationOutcome;
  run: PlaywrightRunResult;
}

export interface BrokerFormAutomationContext extends PlaywrightAutomationContext {
  input: BrokerFormAutomationInput;
}

export type BrokerFormRunner = (
  context: BrokerFormAutomationContext
) => Promise<FormAutomationOutcome | void>;
