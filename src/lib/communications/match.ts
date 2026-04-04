import { prisma } from "@/lib/db";
import type { NormalizedInboundMessage, MatchResult } from "./types";

/**
 * Best-effort matching of an inbound message to an existing removal workflow.
 *
 * Strategy (in priority order):
 * 1. In-Reply-To / References header → match by outbound Message-ID / provider id
 * 2. Sender address → match by broker removalEndpoint / domain
 *
 * Returns the first confident match. If multiple candidates exist, returns ambiguous.
 */
export async function matchInboundMessage(
  msg: NormalizedInboundMessage
): Promise<MatchResult> {
  const unmatched: MatchResult = {
    status: "unmatched",
    removalRequestId: null,
    deletionRequestId: null,
    brokerId: null,
  };

  // 1. Match via threaded reply headers against stored outbound ids.
  const threadReferences = collectThreadReferences(msg);

  if (threadReferences.length > 0) {
    const byMessageId = await prisma.removalRequest.findFirst({
      where: {
        OR: threadReferences.flatMap((reference) => [
          { outboundMessageId: reference },
          { providerMessageId: reference },
        ]),
      },
      orderBy: { sentAt: "desc" },
    });

    if (byMessageId) {
      return {
        status: "matched",
        removalRequestId: byMessageId.id,
        deletionRequestId: byMessageId.deletionRequestId,
        brokerId: byMessageId.brokerId,
      };
    }
  }

  // 2. Match sender domain against broker domains
  const senderDomain = extractDomain(msg.fromAddress);
  if (senderDomain) {
    const brokerMatches = await prisma.broker.findMany({
      where: {
        active: true,
        OR: [
          { domain: senderDomain },
          { removalEndpoint: { contains: senderDomain } },
        ],
      },
    });

    if (brokerMatches.length === 1) {
      const broker = brokerMatches[0];
      // Try to narrow to a specific removal request for this broker
      const recentRequest = await prisma.removalRequest.findFirst({
        where: {
          brokerId: broker.id,
          status: { in: ["submitted", "acknowledged"] },
        },
        orderBy: { sentAt: "desc" },
      });

      if (recentRequest) {
        return {
          status: "matched",
          removalRequestId: recentRequest.id,
          deletionRequestId: recentRequest.deletionRequestId,
          brokerId: broker.id,
        };
      }

      // Matched broker but no active request — still useful context
      return {
        status: "matched",
        removalRequestId: null,
        deletionRequestId: null,
        brokerId: broker.id,
      };
    }

    if (brokerMatches.length > 1) {
      return {
        status: "ambiguous",
        removalRequestId: null,
        deletionRequestId: null,
        brokerId: null,
      };
    }
  }

  return unmatched;
}

function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0) return null;
  return email.slice(atIndex + 1).toLowerCase().trim();
}

function collectThreadReferences(msg: NormalizedInboundMessage): string[] {
  const rawReferences = [
    msg.headers?.["In-Reply-To"],
    msg.headers?.["in-reply-to"],
    msg.headers?.["References"],
    msg.headers?.["references"],
    msg.providerThreadId,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return [...new Set(rawReferences.flatMap(extractMessageIds))];
}

function extractMessageIds(value: string): string[] {
  const bracketedIds = value.match(/<[^>]+>/g);
  if (bracketedIds && bracketedIds.length > 0) {
    return bracketedIds
      .map((item) => normalizeMessageId(item))
      .filter((item): item is string => item !== null);
  }

  return value
    .split(/\s+/)
    .map((item) => normalizeMessageId(item))
    .filter((item): item is string => item !== null);
}

function normalizeMessageId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    const normalized = trimmed.slice(1, -1).trim();
    return normalized.length > 0 ? normalized : null;
  }

  return trimmed;
}
