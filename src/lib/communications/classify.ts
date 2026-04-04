import type {
  NormalizedInboundMessage,
  MatchResult,
  ClassificationLabel,
  ClassificationSignal,
  ClassificationResult,
} from "./types";

/**
 * Confidence thresholds.
 *
 * LABEL_THRESHOLD: minimum score to assign a label.
 * REVIEW_THRESHOLD: below this, requiresReview is forced true even if a label is assigned.
 */
const LABEL_THRESHOLD = 30;
const REVIEW_THRESHOLD = 60;

/**
 * Label priority — higher-priority labels win ties and override
 * lower-priority labels that merely accumulated more additive weight.
 * A single strong needs_more_info signal should outrank three stacked
 * acknowledgment signals.
 */
const LABEL_PRIORITY: Record<ClassificationLabel, number> = {
  needs_more_info: 5,
  rejection: 4,
  completion: 3,
  acknowledgment: 2,
  noise: 1,
};

/**
 * Rule-based reply classifier.
 *
 * Evaluates subject, text body, and (stripped) HTML body against keyword
 * pattern rules. Each matching rule emits a weighted signal for a label.
 *
 * Winner selection uses priority-aware scoring: when multiple labels
 * exceed LABEL_THRESHOLD, a higher-priority label wins unless the
 * lower-priority label's score exceeds it by more than PRIORITY_OVERRIDE_GAP.
 * This ensures "please provide ID" outranks stacked "thank you / received /
 * processing" signals.
 *
 * Sender-based rules (e.g. noreply@ detection) are evaluated against
 * the actual fromAddress, not the message body.
 */
export function classifyReply(
  msg: NormalizedInboundMessage,
  match: MatchResult
): ClassificationResult {
  const subject = (msg.subject ?? "").toLowerCase();
  const text = extractPlainText(msg.textBody, msg.htmlBody).toLowerCase();
  const combined = `${subject} ${text}`;
  const sender = msg.fromAddress.toLowerCase();

  const signals: ClassificationSignal[] = [];

  for (const rule of CONTENT_RULES) {
    if (rule.pattern.test(combined)) {
      signals.push({
        rule: rule.name,
        label: rule.label,
        weight: rule.weight,
        detail: rule.detail,
      });
    }
  }

  for (const rule of SENDER_RULES) {
    if (rule.pattern.test(sender)) {
      signals.push({
        rule: rule.name,
        label: rule.label,
        weight: rule.weight,
        detail: rule.detail,
      });
    }
  }

  // Aggregate scores per label
  const scores = new Map<ClassificationLabel, number>();
  for (const sig of signals) {
    scores.set(sig.label, (scores.get(sig.label) ?? 0) + sig.weight);
  }

  // Priority-aware winner selection: among labels that meet the threshold,
  // pick the highest-priority one unless a lower-priority label leads by
  // more than PRIORITY_OVERRIDE_GAP points.
  const PRIORITY_OVERRIDE_GAP = 50;

  const eligible = [...scores.entries()]
    .filter(([, score]) => score >= LABEL_THRESHOLD)
    .sort((a, b) => {
      const priDiff = LABEL_PRIORITY[b[0]] - LABEL_PRIORITY[a[0]];
      if (priDiff !== 0) return priDiff;
      return b[1] - a[1];
    });

  let bestLabel: ClassificationLabel | null = null;
  let bestScore = 0;

  if (eligible.length > 0) {
    // Start with the highest-priority eligible label
    bestLabel = eligible[0][0];
    bestScore = eligible[0][1];

    // Allow a lower-priority label to override only if it leads by a wide margin
    for (const [label, score] of eligible) {
      if (LABEL_PRIORITY[label] < LABEL_PRIORITY[bestLabel] && score > bestScore + PRIORITY_OVERRIDE_GAP) {
        bestLabel = label;
        bestScore = score;
      }
    }
  }

  const confidence = Math.min(bestScore, 100);

  const requiresReview = computeRequiresReview(
    bestLabel,
    confidence,
    match
  );

  return {
    label: bestLabel,
    confidence,
    signals,
    requiresReview,
  };
}

function computeRequiresReview(
  label: ClassificationLabel | null,
  confidence: number,
  match: MatchResult
): boolean {
  // No label assigned — always needs review
  if (!label) return true;

  // Low confidence — needs review even with a label
  if (confidence < REVIEW_THRESHOLD) return true;

  // Match context: broker_only, ambiguous, or unmatched → review
  if (match.status !== "matched") return true;

  return false;
}

/**
 * Strip HTML tags to get usable text for classification.
 * Prefers textBody; falls back to a naive tag-stripped htmlBody.
 */
function extractPlainText(
  textBody: string | null,
  htmlBody: string | null
): string {
  if (textBody && textBody.trim().length > 0) return textBody;
  if (!htmlBody) return "";

  return htmlBody
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#?\w+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Rule definitions ─────────────────────────────────────────

interface ClassificationRule {
  name: string;
  label: ClassificationLabel;
  weight: number;
  pattern: RegExp;
  detail: string;
}

/**
 * Content rules — evaluated against the combined subject + body text.
 */
const CONTENT_RULES: ClassificationRule[] = [
  // ── needs_more_info (highest priority) ──────────────────
  {
    name: "nmi_verify_identity",
    label: "needs_more_info",
    weight: 50,
    pattern:
      /verify your identity|send.{0,20}(id|identification|proof)|provide.{0,20}(id|identification|proof)|identity verification/,
    detail: "Broker requests identity verification",
  },
  {
    name: "nmi_additional_info",
    label: "needs_more_info",
    weight: 45,
    pattern:
      /need.{0,15}(additional|more|further) (info|information|detail|data)|require.{0,15}(additional|more|further) (info|information|detail)|please (provide|send|submit|supply).{0,20}(information|details|data|documents)/,
    detail: "Broker requests additional information",
  },
  {
    name: "nmi_click_confirm",
    label: "needs_more_info",
    weight: 40,
    pattern:
      /click.{0,15}(confirm|verify|link|button|here to)|confirm your (request|email|identity)|verification link/,
    detail: "Broker asks user to click a confirmation link",
  },
  {
    name: "nmi_respond_to",
    label: "needs_more_info",
    weight: 35,
    pattern:
      /please (respond|reply|contact us)|respond.{0,10}(with|to this)|reply.{0,10}(with|to this)/,
    detail: "Broker asks for a response",
  },

  // ── rejection ───────────────────────────────────────────
  {
    name: "rej_denied",
    label: "rejection",
    weight: 50,
    pattern:
      /request.{0,15}(denied|rejected|declined)|cannot.{0,15}(process|fulfill|complete|honor)|unable to (process|fulfill|complete|verify|honor)/,
    detail: "Broker explicitly denied or rejected the request",
  },
  {
    name: "rej_not_found",
    label: "rejection",
    weight: 40,
    pattern:
      /no.{0,10}(record|data|information|account).{0,10}(found|on file|located|match)|could not (find|locate|identify)|not.{0,10}in our (system|database|records)/,
    detail: "Broker reports no matching records found",
  },
  {
    name: "rej_ineligible",
    label: "rejection",
    weight: 40,
    pattern:
      /not eligible|does not (qualify|apply)|outside.{0,15}(scope|jurisdiction)|not subject to/,
    detail: "Broker reports request is ineligible",
  },

  // ── completion ──────────────────────────────────────────
  {
    name: "comp_removed",
    label: "completion",
    weight: 50,
    pattern:
      /\b(removed|deleted|erased|purged)\b.{0,20}(your|the|all)?.{0,10}(data|record|information|profile|account|listing)|your.{0,10}(data|record|information|profile|account|listing).{0,10}(has been|have been|was|were).{0,10}(removed|deleted|erased|purged)/,
    detail: "Broker confirms data was removed",
  },
  {
    name: "comp_completed",
    label: "completion",
    weight: 45,
    pattern:
      /request.{0,15}(has been |was )?(completed|processed|fulfilled|resolved)|opt.?out.{0,15}(has been |was )?(processed|completed|confirmed)|suppression.{0,15}(complete|confirmed|processed)/,
    detail: "Broker confirms request was completed",
  },
  {
    name: "comp_no_longer",
    label: "completion",
    weight: 40,
    pattern:
      /no longer.{0,15}(appear|listed|stored|retained|shared|sold|available)|will not.{0,15}(appear|be listed|be shared|be sold)/,
    detail: "Broker confirms data will no longer appear",
  },

  // ── acknowledgment ─────────────────────────────────────
  {
    name: "ack_received",
    label: "acknowledgment",
    weight: 35,
    pattern:
      /request.{0,15}(has been |was )?(received|logged|recorded|noted)|we.{0,10}(received|got|have).{0,10}(your|the).{0,10}request/,
    detail: "Broker acknowledges request was received",
  },
  {
    name: "ack_processing",
    label: "acknowledgment",
    weight: 30,
    pattern:
      /\b(processing|reviewing|working on|looking into)\b.{0,15}(your|the)?.{0,10}request|request.{0,15}(is being|is under|currently).{0,10}(processed|reviewed|handled)/,
    detail: "Broker indicates request is being processed",
  },
  {
    name: "ack_thank_you",
    label: "acknowledgment",
    weight: 20,
    pattern:
      /thank you for (contacting|reaching out|your (request|submission|inquiry|email|message))|we appreciate your (patience|inquiry|request)/,
    detail: "Broker thanks user for the request",
  },
  {
    name: "ack_timeframe",
    label: "acknowledgment",
    weight: 25,
    pattern:
      /(within|up to|approximately|about) \d+.{0,5}(day|business day|week|calendar day)|respond.{0,15}(within|in) \d+/,
    detail: "Broker mentions a processing timeframe",
  },

  // ── noise ───────────────────────────────────────────────
  {
    name: "noise_auto_reply",
    label: "noise",
    weight: 35,
    pattern:
      /auto.?reply|automatic.?reply|out of (the )?office|away from.{0,10}(the )?office|on (vacation|holiday|leave|pto)|do.?not.?reply/,
    detail: "Message is an auto-reply or out-of-office",
  },
  {
    name: "noise_unsubscribe",
    label: "noise",
    weight: 30,
    pattern:
      /unsubscribe from (this|these|our)|manage your (subscription|preferences|email)|email preferences|mailing list/,
    detail: "Message is a newsletter or subscription notification",
  },
  {
    name: "noise_delivery_failure",
    label: "noise",
    weight: 40,
    pattern:
      /delivery.{0,10}(failed|failure|status|notification)|undeliverable|mail.{0,10}(delivery|system).{0,10}(error|failure)|permanent.{0,10}(failure|error)|mailbox.{0,10}(full|unavailable)/,
    detail: "Message is a delivery failure notification",
  },
];

/**
 * Sender rules — evaluated against the fromAddress, not message content.
 */
const SENDER_RULES: ClassificationRule[] = [
  {
    name: "noise_noreply_sender",
    label: "noise",
    weight: 15,
    pattern: /\bnoreply@|\bno-reply@|\bdo-not-reply@/,
    detail: "Sender is a no-reply address",
  },
];
