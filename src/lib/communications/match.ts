import { prisma } from "@/lib/db";
import { buildBrokerAliasDomainMap } from "@/lib/brokers/registry";
import type {
  NormalizedInboundMessage,
  MatchResult,
  MatchCandidate,
  MatchSignal,
} from "./types";

/**
 * Score thresholds.
 *
 * CONFIDENT: strong enough to declare a full match (request + broker).
 * BROKER_ONLY: enough to identify the broker but not a specific request.
 * AMBIGUITY_GAP: if top two candidates are within this gap, declare ambiguous.
 */
const CONFIDENT_THRESHOLD = 50;
const BROKER_ONLY_THRESHOLD = 15;
const AMBIGUITY_GAP = 10;

/**
 * Score weights for each signal type.
 */
const SCORES = {
  threadMessageId: 100,
  threadReferences: 90,
  senderAddress: 40,
  senderDomain: 20,
  brokerAliasDomain: 20,
  recipientAddress: 5,
  subjectBrokerName: 5,
  requestActiveStatus: 10,
  requestRecency: 5,
} as const;

/** Requests older than this are down-weighted for recency. */
const RECENCY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const ACTIVE_STATUSES = ["pending", "submitted", "acknowledged"];

const UNMATCHED: MatchResult = {
  status: "unmatched",
  removalRequestId: null,
  deletionRequestId: null,
  brokerId: null,
  confidence: null,
  signals: [],
};

/**
 * Multi-signal matching of an inbound message to an existing removal workflow.
 *
 * Strategy:
 * 1. Collect thread references (In-Reply-To, References, provider thread id)
 *    and try exact matches against outbound message ids — highest confidence.
 * 2. Identify broker candidates via sender address, sender domain, and
 *    broker alias domains.
 * 3. For each broker candidate, find active removal requests and score them
 *    with additional signals (recency, status, subject heuristics).
 * 4. Rank candidates, apply ambiguity detection, and return the best match
 *    with full signal traceability.
 */
export async function matchInboundMessage(
  msg: NormalizedInboundMessage
): Promise<MatchResult> {
  const candidates: MatchCandidate[] = [];

  // ── Phase 1: Thread-based matching (highest confidence) ──────────
  const threadCandidates = await matchByThread(msg);
  candidates.push(...threadCandidates);

  // If we got a high-confidence thread match, skip weaker signals
  const bestThread = threadCandidates.sort((a, b) => b.score - a.score)[0];
  if (bestThread && bestThread.score >= CONFIDENT_THRESHOLD) {
    return buildResult(candidates);
  }

  // ── Phase 2: Broker identification via sender ────────────────────
  const brokerCandidates = await matchByBroker(msg);

  // ── Phase 3: Score removal requests for each broker candidate ────
  for (const bc of brokerCandidates) {
    const requestCandidates = await scoreRequestsForBroker(bc, msg);
    if (requestCandidates.length > 0) {
      candidates.push(...requestCandidates);
    } else {
      // Broker identified but no request-level match — keep as broker-only
      candidates.push(bc);
    }
  }

  return buildResult(candidates);
}

// ─── Phase 1: Thread matching ──────────────────────────────────────

async function matchByThread(
  msg: NormalizedInboundMessage
): Promise<MatchCandidate[]> {
  const threadRefs = collectThreadReferences(msg);
  if (threadRefs.length === 0) return [];

  const candidates: MatchCandidate[] = [];

  const matchedRequests = await prisma.removalRequest.findMany({
    where: {
      OR: threadRefs.flatMap((ref) => [
        { outboundMessageId: ref },
        { providerMessageId: ref },
      ]),
    },
    orderBy: { sentAt: "desc" },
  });

  for (const req of matchedRequests) {
    const signals: MatchSignal[] = [];
    let score = 0;

    // Determine which reference matched and which field
    for (const ref of threadRefs) {
      if (req.outboundMessageId === ref) {
        signals.push({
          signal: "thread_message_id",
          hit: true,
          detail: `In-Reply-To/References matched outboundMessageId on request ${req.id}`,
        });
        score = Math.max(score, SCORES.threadMessageId);
      }
      if (req.providerMessageId === ref) {
        signals.push({
          signal: "thread_references",
          hit: true,
          detail: `In-Reply-To/References matched providerMessageId on request ${req.id}`,
        });
        score = Math.max(score, SCORES.threadReferences);
      }
    }

    candidates.push({
      removalRequestId: req.id,
      deletionRequestId: req.deletionRequestId,
      brokerId: req.brokerId,
      score,
      signals,
    });
  }

  return candidates;
}

// ─── Phase 2: Broker identification ────────────────────────────────

interface BrokerMatch {
  brokerId: string;
  brokerName: string;
  signals: MatchSignal[];
  score: number;
}

async function matchByBroker(
  msg: NormalizedInboundMessage
): Promise<MatchCandidate[]> {
  const senderDomain = extractDomain(msg.fromAddress);
  if (!senderDomain) return [];

  const brokerMatches: BrokerMatch[] = [];

  // Check exact sender address against broker removalEndpoints
  const byExactAddress = await prisma.broker.findMany({
    where: {
      active: true,
      removalEndpoint: msg.fromAddress.toLowerCase(),
    },
  });

  for (const broker of byExactAddress) {
    brokerMatches.push({
      brokerId: broker.id,
      brokerName: broker.name,
      score: SCORES.senderAddress,
      signals: [
        {
          signal: "sender_address",
          hit: true,
          detail: `Sender ${msg.fromAddress} exactly matches removalEndpoint for ${broker.name}`,
        },
      ],
    });
  }

  // Check sender domain against broker primary domain
  const byDomain = await prisma.broker.findMany({
    where: {
      active: true,
      domain: senderDomain,
    },
  });

  for (const broker of byDomain) {
    // Skip if we already matched this broker by exact address
    if (brokerMatches.some((m) => m.brokerId === broker.id)) continue;

    brokerMatches.push({
      brokerId: broker.id,
      brokerName: broker.name,
      score: SCORES.senderDomain,
      signals: [
        {
          signal: "sender_domain",
          hit: true,
          detail: `Sender domain ${senderDomain} matches broker domain for ${broker.name}`,
        },
      ],
    });
  }

  // Check sender domain against broker removalEndpoint containing the domain
  const byEndpointDomain = await prisma.broker.findMany({
    where: {
      active: true,
      removalEndpoint: { contains: senderDomain },
    },
  });

  for (const broker of byEndpointDomain) {
    if (brokerMatches.some((m) => m.brokerId === broker.id)) continue;

    brokerMatches.push({
      brokerId: broker.id,
      brokerName: broker.name,
      score: SCORES.senderDomain,
      signals: [
        {
          signal: "sender_domain",
          hit: true,
          detail: `Sender domain ${senderDomain} found in removalEndpoint for ${broker.name}`,
        },
      ],
    });
  }

  // Check alias domains from static registry
  const aliasMap = buildBrokerAliasDomainMap();
  const aliasBrokerName = aliasMap.get(senderDomain);
  if (aliasBrokerName && !brokerMatches.some((m) => m.brokerName === aliasBrokerName)) {
    const aliasBroker = await prisma.broker.findFirst({
      where: { name: aliasBrokerName, active: true },
    });
    if (aliasBroker) {
      brokerMatches.push({
        brokerId: aliasBroker.id,
        brokerName: aliasBroker.name,
        score: SCORES.brokerAliasDomain,
        signals: [
          {
            signal: "broker_alias_domain",
            hit: true,
            detail: `Sender domain ${senderDomain} is a known alias for ${aliasBroker.name}`,
          },
        ],
      });
    }
  }

  // Convert broker matches to candidates (broker-only, no request yet)
  return brokerMatches.map((bm) => ({
    removalRequestId: null,
    deletionRequestId: null,
    brokerId: bm.brokerId,
    score: bm.score,
    signals: bm.signals,
  }));
}

// ─── Phase 3: Score requests for a broker candidate ────────────────

async function scoreRequestsForBroker(
  brokerCandidate: MatchCandidate,
  msg: NormalizedInboundMessage
): Promise<MatchCandidate[]> {
  const requests = await prisma.removalRequest.findMany({
    where: {
      brokerId: brokerCandidate.brokerId,
    },
    include: { broker: true },
    orderBy: { sentAt: "desc" },
  });

  if (requests.length === 0) return [];

  const candidates: MatchCandidate[] = [];

  for (const req of requests) {
    const signals: MatchSignal[] = [...brokerCandidate.signals];
    let score = brokerCandidate.score;

    // Active status bonus
    if (ACTIVE_STATUSES.includes(req.status)) {
      score += SCORES.requestActiveStatus;
      signals.push({
        signal: "request_active_status",
        hit: true,
        detail: `Request ${req.id} has active status "${req.status}"`,
      });
    } else {
      signals.push({
        signal: "request_active_status",
        hit: false,
        detail: `Request ${req.id} has inactive status "${req.status}"`,
      });
    }

    // Recency bonus
    const sentTime = req.sentAt ?? req.submittedAt ?? req.createdAt;
    const ageMs = msg.receivedAt.getTime() - sentTime.getTime();
    if (ageMs >= 0 && ageMs <= RECENCY_WINDOW_MS) {
      score += SCORES.requestRecency;
      signals.push({
        signal: "request_recency",
        hit: true,
        detail: `Request ${req.id} sent ${Math.round(ageMs / (24 * 60 * 60 * 1000))}d ago (within 90d window)`,
      });
    } else {
      signals.push({
        signal: "request_recency",
        hit: false,
        detail: `Request ${req.id} sent ${Math.round(Math.abs(ageMs) / (24 * 60 * 60 * 1000))}d ago (outside 90d window)`,
      });
    }

    // Subject heuristic: does the subject mention the broker name?
    if (msg.subject && req.broker.name) {
      const subjectLower = msg.subject.toLowerCase();
      const brokerNameLower = req.broker.name.toLowerCase();
      if (subjectLower.includes(brokerNameLower)) {
        score += SCORES.subjectBrokerName;
        signals.push({
          signal: "subject_broker_name",
          hit: true,
          detail: `Subject contains broker name "${req.broker.name}"`,
        });
      }
    }

    candidates.push({
      removalRequestId: req.id,
      deletionRequestId: req.deletionRequestId,
      brokerId: req.brokerId,
      score,
      signals,
    });
  }

  return candidates;
}

// ─── Result builder ────────────────────────────────────────────────

function buildResult(candidates: MatchCandidate[]): MatchResult {
  if (candidates.length === 0) return UNMATCHED;

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const runnerUp = candidates.length > 1 ? candidates[1] : null;

  // Check for ambiguity: if multiple candidates are close in score
  if (
    runnerUp &&
    best.score - runnerUp.score < AMBIGUITY_GAP &&
    best.removalRequestId !== runnerUp.removalRequestId
  ) {
    // Two different requests with similar scores — ambiguous
    // But if they share a broker, we can at least report that
    const sharedBrokerId =
      best.brokerId === runnerUp.brokerId ? best.brokerId : null;

    return {
      status: "ambiguous",
      removalRequestId: null,
      deletionRequestId: null,
      brokerId: sharedBrokerId,
      confidence: best.score,
      signals: best.signals,
    };
  }

  // High-confidence match with request context
  if (best.score >= CONFIDENT_THRESHOLD && best.removalRequestId) {
    return {
      status: "matched",
      removalRequestId: best.removalRequestId,
      deletionRequestId: best.deletionRequestId,
      brokerId: best.brokerId,
      confidence: Math.min(best.score, 100),
      signals: best.signals,
    };
  }

  // Broker-only match: we know the broker but not the specific request
  if (best.score >= BROKER_ONLY_THRESHOLD) {
    const isBrokerOnly = !best.removalRequestId;
    return {
      status: isBrokerOnly ? "broker_only" : "matched",
      removalRequestId: best.removalRequestId,
      deletionRequestId: best.deletionRequestId,
      brokerId: best.brokerId,
      confidence: Math.min(best.score, 100),
      signals: best.signals,
    };
  }

  return UNMATCHED;
}

// ─── Helpers ───────────────────────────────────────────────────────

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
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );

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
