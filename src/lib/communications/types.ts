/** Provider-agnostic shape for an inbound email event. */
export interface NormalizedInboundMessage {
  provider: string;
  providerMessageId: string | null;
  providerThreadId: string | null;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  headers: Record<string, string> | null;
  receivedAt: Date;
  rawPayload: unknown;
}

export type MatchStatus = "matched" | "broker_only" | "unmatched" | "ambiguous";

/** A signal that contributed to (or against) a match candidate. */
export interface MatchSignal {
  /** What evidence was evaluated. */
  signal:
    | "thread_message_id"
    | "thread_references"
    | "sender_address"
    | "sender_domain"
    | "broker_alias_domain"
    | "recipient_address"
    | "subject_broker_name"
    | "request_active_status"
    | "request_recency";
  /** Whether this signal supported the match. */
  hit: boolean;
  /** Short human-readable note, e.g. "In-Reply-To matched outboundMessageId on req_xyz". */
  detail: string;
}

/** Internal candidate produced during matching — ranked by score. */
export interface MatchCandidate {
  removalRequestId: string | null;
  deletionRequestId: string | null;
  brokerId: string;
  score: number;
  signals: MatchSignal[];
}

export interface MatchResult {
  status: MatchStatus;
  removalRequestId: string | null;
  deletionRequestId: string | null;
  brokerId: string | null;
  /** 0-100 confidence score. null when unmatched. */
  confidence: number | null;
  /** Signals that contributed to the match decision. */
  signals: MatchSignal[];
}
