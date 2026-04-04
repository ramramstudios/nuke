import { prisma } from "@/lib/db";
import { normalizeInboundPayload } from "./normalize";
import { matchInboundMessage } from "./match";
import type { NormalizedInboundMessage, MatchResult } from "./types";

export interface IngestResult {
  id: string;
  matchStatus: string;
  matchConfidence: number | null;
  matchSignals: string[];
  matchedRemovalRequestId: string | null;
  matchedDeletionRequestId: string | null;
  matchedBrokerId: string | null;
}

export class InboundValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboundValidationError";
  }
}

/**
 * Main entry point: normalize, match, and persist an inbound message.
 * Never throws on match failure — unmatched messages are stored for later review.
 */
export async function ingestInboundEmail(
  provider: string,
  rawPayload: Record<string, unknown>
): Promise<IngestResult> {
  const normalized = normalizeInboundPayload(provider, rawPayload);
  validateNormalizedInboundMessage(normalized);
  let match: MatchResult;

  try {
    match = await matchInboundMessage(normalized);
  } catch {
    // Matching failure should never block ingestion
    match = {
      status: "unmatched",
      removalRequestId: null,
      deletionRequestId: null,
      brokerId: null,
      confidence: null,
      signals: [],
    };
  }

  const record = await persistInboundMessage(normalized, match);

  logIngestEvent(record.id, normalized.provider, match.status);

  return {
    id: record.id,
    matchStatus: match.status,
    matchConfidence: match.confidence,
    matchSignals: match.signals.filter((s) => s.hit).map((s) => s.detail),
    matchedRemovalRequestId: match.removalRequestId,
    matchedDeletionRequestId: match.deletionRequestId,
    matchedBrokerId: match.brokerId,
  };
}

async function persistInboundMessage(
  msg: NormalizedInboundMessage,
  match: MatchResult
) {
  return prisma.inboundMessage.create({
    data: {
      provider: msg.provider,
      providerMessageId: msg.providerMessageId,
      providerThreadId: msg.providerThreadId,
      fromAddress: msg.fromAddress,
      toAddress: msg.toAddress,
      subject: msg.subject,
      textBody: msg.textBody,
      htmlBody: msg.htmlBody,
      headers: msg.headers ? JSON.stringify(msg.headers) : null,
      receivedAt: msg.receivedAt,
      rawPayload: JSON.stringify(msg.rawPayload),
      matchStatus: match.status,
      matchConfidence: match.confidence,
      matchSignals: match.signals.length > 0 ? JSON.stringify(match.signals) : null,
      matchedRemovalRequestId: match.removalRequestId,
      matchedDeletionRequestId: match.deletionRequestId,
      matchedBrokerId: match.brokerId,
    },
  });
}

function logIngestEvent(id: string, provider: string, matchStatus: string) {
  console.info("[nuke][inbound]", { id, provider, matchStatus });
}

function validateNormalizedInboundMessage(msg: NormalizedInboundMessage) {
  const missingFields: string[] = [];

  if (!msg.fromAddress.trim()) missingFields.push("fromAddress");
  if (!msg.toAddress.trim()) missingFields.push("toAddress");

  if (missingFields.length > 0) {
    throw new InboundValidationError(
      `Inbound payload missing required normalized fields: ${missingFields.join(", ")}`
    );
  }
}
