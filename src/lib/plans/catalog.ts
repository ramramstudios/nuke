import type {
  SelfServePlanCatalogEntry,
  SelfServePlanKey,
} from "@/lib/plans/types";

export const SELF_SERVE_PLAN_CATALOG: SelfServePlanCatalogEntry[] = [
  {
    key: "free-self-serve",
    name: "Self-Serve Free",
    tagline: "Run it yourself with NUKE doing the easy ones",
    priceUsd: 0,
    cadence: "free",
    recommendation:
      "Best when most of your covered brokers can be submitted automatically and you're comfortable doing a few chores yourself.",
    summary:
      "NUKE submits the brokers it can automate end-to-end and gives you a guided step for each broker that needs a CAPTCHA, confirmation link, or manual link. You finish the chores; we keep them organized.",
    coversBuckets: ["automatic"],
    userHandlesBuckets: ["chore", "managed"],
    inclusions: [
      {
        label: "Automatic submissions",
        detail:
          "Every broker NUKE can submit without your help is dispatched and tracked for you.",
      },
      {
        label: "Guided chore queue",
        detail:
          "Each broker that needs a chore is converted into a clear next step with the right link.",
      },
      {
        label: "Activity timeline",
        detail:
          "See submission evidence, replies, and follow-up needs for every broker in one place.",
      },
    ],
    exclusions: [
      "Managed help for blocked or hard-verification brokers (BeenVerified, Intelius, Whitepages-style flows).",
      "Concierge follow-ups for stalled or rejected requests.",
    ],
    acknowledgements: [
      {
        key: "chore_scope",
        label:
          "I understand I'll need to finish broker chores for CAPTCHAs, confirmation links, and manual opt-out pages on my own.",
      },
    ],
  },
  {
    key: "assisted-self-serve",
    name: "Assisted Self-Serve",
    tagline: "Automation plus chore reminders and follow-ups",
    priceUsd: 9,
    cadence: "monthly",
    recommendation:
      "Best when you have a steady mix of automatic and chore brokers and you want NUKE to keep the chores from piling up.",
    summary:
      "Everything in the free plan, plus chore reminders, retry handling, and broker-specific copy that explains exactly what to do for each chore.",
    coversBuckets: ["automatic"],
    userHandlesBuckets: ["chore", "managed"],
    inclusions: [
      {
        label: "Automatic submissions",
        detail:
          "Same automated submissions as the free plan, with priority queue placement.",
      },
      {
        label: "Chore reminders and broker-specific copy",
        detail:
          "Each chore comes with broker-specific instructions and follow-up nudges so nothing stalls.",
      },
      {
        label: "Stalled-request triage",
        detail:
          "Requests that have not seen progress are surfaced for action with a clear next step.",
      },
    ],
    exclusions: [
      "Managed handling for blocked brokers (NUKE still surfaces these, but you complete them yourself or upgrade for help).",
    ],
    acknowledgements: [
      {
        key: "chore_scope",
        label:
          "I understand I'll still complete broker chores myself, with NUKE keeping them organized and reminding me when one stalls.",
      },
    ],
  },
  {
    key: "concierge-managed",
    name: "Concierge Managed",
    tagline: "Automation plus a human team for the hard ones",
    priceUsd: 29,
    cadence: "monthly",
    recommendation:
      "Best when several of your brokers are blocked or need identity verification and you want a human team to take it from there.",
    summary:
      "Everything in Assisted Self-Serve, plus the concierge team picks up blocked, identity-verification, and hard-handoff brokers and works them on your behalf.",
    coversBuckets: ["automatic", "chore", "managed"],
    userHandlesBuckets: [],
    inclusions: [
      {
        label: "Automatic submissions",
        detail:
          "All brokers NUKE can submit without help are dispatched and tracked for you.",
      },
      {
        label: "Chore handling",
        detail:
          "The concierge team finishes broker chores like CAPTCHAs, confirmation links, and manual opt-out flows for you.",
      },
      {
        label: "Hard-broker managed help",
        detail:
          "Blocked, identity-verification, and hard-handoff brokers are worked by humans on your behalf.",
      },
      {
        label: "Pilot-cohort priority",
        detail:
          "Concierge plan members reserve seats in the active managed-service pilot cohort first.",
      },
    ],
    exclusions: [
      "Brokers that explicitly require notarized identity work, telephony verification, or enterprise-only flows are still surfaced as user-action chores until those workflows are added.",
    ],
    acknowledgements: [
      {
        key: "chore_scope",
        label:
          "I understand chores I have not completed will be picked up by the concierge team during their next support cycle, not instantly.",
      },
      {
        key: "managed_handoff",
        label:
          "I understand that managed help is delivered by the existing pilot-cohort workflow and may require a separate manual-invoice payment until self-serve checkout ships.",
      },
    ],
  },
];

const SELF_SERVE_PLAN_INDEX = new Map<SelfServePlanKey, SelfServePlanCatalogEntry>(
  SELF_SERVE_PLAN_CATALOG.map((entry) => [entry.key, entry])
);

export function getSelfServePlan(
  key: SelfServePlanKey
): SelfServePlanCatalogEntry {
  const entry = SELF_SERVE_PLAN_INDEX.get(key);
  if (!entry) {
    throw new Error(`Unknown self-serve plan key: ${key}`);
  }
  return entry;
}

export function isSelfServePlanKey(value: unknown): value is SelfServePlanKey {
  return (
    typeof value === "string" &&
    SELF_SERVE_PLAN_INDEX.has(value as SelfServePlanKey)
  );
}
