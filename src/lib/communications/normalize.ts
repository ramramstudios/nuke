import type { NormalizedInboundMessage } from "./types";

/**
 * Normalize a raw provider webhook payload into the internal shape.
 * Each provider adapter extracts fields from the provider's format.
 */
export function normalizeInboundPayload(
  provider: string,
  raw: Record<string, unknown>
): NormalizedInboundMessage {
  switch (provider) {
    case "resend":
      return normalizeResend(raw);
    case "sendgrid":
      return normalizeSendGrid(raw);
    default:
      return normalizeGeneric(provider, raw);
  }
}

function normalizeResend(raw: Record<string, unknown>): NormalizedInboundMessage {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  return {
    provider: "resend",
    providerMessageId: str(data.email_id) ?? str(data.message_id),
    providerThreadId: str(data.thread_id),
    fromAddress: str(data.from) ?? "",
    toAddress: str(data.to) ?? firstOf(data.to) ?? "",
    subject: str(data.subject),
    textBody: str(data.text),
    htmlBody: str(data.html),
    headers: extractHeaders(data.headers),
    receivedAt: parseDate(data.created_at) ?? new Date(),
    rawPayload: raw,
  };
}

function normalizeSendGrid(raw: Record<string, unknown>): NormalizedInboundMessage {
  return {
    provider: "sendgrid",
    providerMessageId: extractHeaderValue(raw, "Message-ID"),
    providerThreadId: extractHeaderValue(raw, "In-Reply-To"),
    fromAddress: str(raw.from) ?? "",
    toAddress: str(raw.to) ?? "",
    subject: str(raw.subject),
    textBody: str(raw.text),
    htmlBody: str(raw.html),
    headers: extractHeaders(raw.headers),
    receivedAt: new Date(),
    rawPayload: raw,
  };
}

function normalizeGeneric(
  provider: string,
  raw: Record<string, unknown>
): NormalizedInboundMessage {
  return {
    provider,
    providerMessageId: str(raw.providerMessageId) ?? str(raw.messageId) ?? str(raw.message_id),
    providerThreadId: str(raw.providerThreadId) ?? str(raw.threadId) ?? str(raw.thread_id),
    fromAddress: str(raw.from) ?? str(raw.fromAddress) ?? str(raw.sender) ?? "",
    toAddress: str(raw.to) ?? str(raw.toAddress) ?? str(raw.recipient) ?? "",
    subject: str(raw.subject),
    textBody: str(raw.text) ?? str(raw.textBody) ?? str(raw.body),
    htmlBody: str(raw.html) ?? str(raw.htmlBody),
    headers: extractHeaders(raw.headers),
    receivedAt: parseDate(raw.receivedAt) ?? parseDate(raw.date) ?? new Date(),
    rawPayload: raw,
  };
}

// ─── helpers ────────────────────────────────────────────────

function str(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function firstOf(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function extractHeaders(value: unknown): Record<string, string> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, string>;
    } catch {
      return null;
    }
  }
  return null;
}

function extractHeaderValue(raw: Record<string, unknown>, header: string): string | null {
  const headers = extractHeaders(raw.headers);
  if (!headers) return null;
  // headers may be keyed case-insensitively
  const key = Object.keys(headers).find((k) => k.toLowerCase() === header.toLowerCase());
  return key ? str(headers[key]) : null;
}
