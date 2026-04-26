import type { Page } from "playwright";
import type { FormAutomationBlockerType } from "@/lib/automation/types";

export interface AutomationBlockerDetection {
  blockerType: FormAutomationBlockerType;
  reason: string;
}

const CAPTCHA_SELECTORS = [
  "iframe[title*='reCAPTCHA']",
  "iframe[src*='recaptcha']",
  ".g-recaptcha",
  ".h-captcha",
  "iframe[src*='hcaptcha']",
  "textarea[name='g-recaptcha-response']",
  "textarea[name='h-captcha-response']",
  "input[name='recaptcha']",
];

export async function detectAutomationBlockerOnPage(
  page: Page,
  brokerName: string
): Promise<AutomationBlockerDetection | null> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");

  if (await pageHasCaptcha(page, bodyText)) {
    return {
      blockerType: "captcha",
      reason: `${brokerName} presented a live CAPTCHA challenge before NUKE could safely continue.`,
    };
  }

  return classifyAutomationBlockerText(
    [url, title, bodyText.slice(0, 6_000)].join("\n"),
    brokerName
  );
}

export async function pageHasCaptcha(
  page: Page,
  bodyText?: string
): Promise<boolean> {
  const text = bodyText ?? (await page.locator("body").innerText().catch(() => ""));
  if (/captcha|recaptcha|hcaptcha|verify you are human|not a robot/i.test(text)) {
    return true;
  }

  for (const selector of CAPTCHA_SELECTORS) {
    if ((await page.locator(selector).count().catch(() => 0)) > 0) {
      return true;
    }
  }

  return false;
}

export function classifyAutomationBlockerText(
  text: string,
  brokerName: string
): AutomationBlockerDetection | null {
  const normalized = text.toLowerCase();

  if (matchesAny(normalized, [
    /too many requests/,
    /rate[-\s]?limit/,
    /\b429\b/,
    /try again later/,
    /temporarily blocked/,
    /temporarily unavailable/,
    /unusual traffic/,
  ])) {
    return {
      blockerType: "rate_limit",
      reason: `${brokerName} rate-limited or temporarily blocked the automation session.`,
    };
  }

  if (matchesAny(normalized, [
    /captcha/,
    /recaptcha/,
    /hcaptcha/,
    /not a robot/,
    /verify you are human/,
  ])) {
    return {
      blockerType: "captcha",
      reason: `${brokerName} presented a live CAPTCHA challenge before NUKE could safely continue.`,
    };
  }

  if (matchesAny(normalized, [
    /identity verification/,
    /verify your identity/,
    /proof of identity/,
    /government[-\s]?issued id/,
    /driver'?s license/,
    /date of birth/,
    /birthdate/,
    /last four digits/,
    /social security/,
  ])) {
    return {
      blockerType: "identity_verification",
      reason: `${brokerName} requires identity verification before this removal can continue.`,
    };
  }

  if (matchesAny(normalized, [
    /upload (a |your )?(document|id|identification)/,
    /attach (a |your )?(document|id|identification)/,
    /copy of (a |your )?(id|identification|driver'?s license)/,
  ])) {
    return {
      blockerType: "document_upload",
      reason: `${brokerName} requires a document upload before this removal can continue.`,
    };
  }

  if (matchesAny(normalized, [
    /check your email/,
    /confirmation email/,
    /verification email/,
    /confirm (your )?(email|request)/,
    /click (the )?(confirmation|verification) link/,
    /we sent (you )?(an )?email/,
  ])) {
    return {
      blockerType: "confirmation_required",
      reason: `${brokerName} requires email confirmation before the removal can continue.`,
    };
  }

  if (matchesAny(normalized, [
    /access denied/,
    /attention required/,
    /checking your browser/,
    /enable javascript and cookies/,
    /security challenge/,
    /cloudflare/,
    /blocked/,
    /just a moment/,
    /browser verification/,
  ])) {
    return {
      blockerType: "bot_check",
      reason: `${brokerName} presented a live bot-check or browser-verification screen.`,
    };
  }

  if (matchesAny(normalized, [
    /browserType\.launch/i,
    /target page, context or browser has been closed/i,
    /executable doesn't exist/i,
    /timed out/i,
  ])) {
    return {
      blockerType: "automation_runtime_failure",
      reason: `${brokerName} automation could not complete because the browser session failed before reaching a trustworthy broker state.`,
    };
  }

  return null;
}

export function classifyAutomationFailure(
  errorMessage: string,
  brokerName: string
): AutomationBlockerDetection {
  return (
    classifyAutomationBlockerText(errorMessage, brokerName) ?? {
      blockerType: "automation_gap",
      reason: `${brokerName} automation stopped before it could complete the broker flow: ${errorMessage}`,
    }
  );
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
