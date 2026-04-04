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

export type MatchStatus = "matched" | "unmatched" | "ambiguous";

export interface MatchResult {
  status: MatchStatus;
  removalRequestId: string | null;
  deletionRequestId: string | null;
  brokerId: string | null;
}
