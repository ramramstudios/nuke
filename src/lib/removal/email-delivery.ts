import { randomUUID } from "crypto";

export type EmailDeliveryMode = "dry-run" | "resend";

export interface OutboundBrokerEmail {
  brokerName: string;
  requestId: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface EmailDeliveryResult {
  mode: EmailDeliveryMode;
  providerMessageId: string;
}

export async function deliverBrokerEmail(
  message: OutboundBrokerEmail
): Promise<EmailDeliveryResult> {
  const mode = getEmailDeliveryMode();

  if (mode === "dry-run") {
    const providerMessageId = `dryrun_${randomUUID()}`;
    logEmailEvent("accepted", {
      brokerName: message.brokerName,
      mode,
      providerMessageId,
      requestId: message.requestId,
    });
    return { mode, providerMessageId };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=resend");
  }
  if (!from) {
    throw new Error("EMAIL_FROM is required when EMAIL_DELIVERY_MODE=resend");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo,
    }),
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    const errorMessage = extractProviderError(payload) || `Resend request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const payload = await response.json() as { id?: string };
  const providerMessageId = payload.id;
  if (!providerMessageId) {
    throw new Error("Resend accepted the request without returning a message id");
  }

  logEmailEvent("accepted", {
    brokerName: message.brokerName,
    mode,
    providerMessageId,
    requestId: message.requestId,
  });

  return { mode, providerMessageId };
}

function getEmailDeliveryMode(): EmailDeliveryMode {
  return process.env.EMAIL_DELIVERY_MODE === "resend" ? "resend" : "dry-run";
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractProviderError(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const message =
    ("message" in payload && typeof payload.message === "string" && payload.message) ||
    ("error" in payload && typeof payload.error === "string" && payload.error);

  return message ?? null;
}

function logEmailEvent(
  event: "accepted" | "failed",
  details: {
    brokerName: string;
    mode: EmailDeliveryMode;
    providerMessageId?: string;
    requestId: string;
    error?: string;
  }
) {
  const safeDetails = {
    brokerName: details.brokerName,
    mode: details.mode,
    providerMessageId: details.providerMessageId,
    requestId: details.requestId,
    error: details.error,
  };

  if (event === "failed") {
    console.error("[nuke][email]", safeDetails);
    return;
  }

  console.info("[nuke][email]", safeDetails);
}

export function logBrokerEmailFailure(
  message: OutboundBrokerEmail,
  error: string
) {
  logEmailEvent("failed", {
    brokerName: message.brokerName,
    mode: getEmailDeliveryMode(),
    requestId: message.requestId,
    error,
  });
}
