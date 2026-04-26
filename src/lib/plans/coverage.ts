import type {
  ConsumerBrokerCoverage,
  ConsumerCoverageBucket,
  ConsumerCoverageBucketSummary,
  ConsumerCoverageInput,
  ConsumerCoverageReport,
} from "@/lib/plans/types";

/**
 * Brokers whose published opt-out flow has structural blockers strong enough
 * that NUKE cannot reliably ship them as a "quick chore" — phone verification,
 * notarized ID, enterprise login, per-email scaling limits. These belong in the
 * managed/concierge bucket regardless of recent automation history.
 */
const STRUCTURAL_MANAGED_BROKERS = new Set<string>([
  "BeenVerified",
  "Intelius",
  "Whitepages",
  "MyLife",
  "Radaris",
]);

const BUCKET_LABELS: Record<ConsumerCoverageBucket, string> = {
  automatic: "Automatic",
  chore: "Quick chore",
  managed: "Managed help",
};

const BUCKET_DESCRIPTIONS: Record<ConsumerCoverageBucket, string> = {
  automatic: "NUKE submits these brokers without any help from you.",
  chore:
    "NUKE prepares the request and you finish a short step like a CAPTCHA, confirmation link, or manual opt-out page.",
  managed:
    "These brokers have hard verification or anti-bot blockers, so NUKE routes them into managed help instead of leaving you stuck.",
};

interface ClassifyOptions {
  hasOpenChore?: boolean;
}

export function classifyConsumerBucket(
  broker: ConsumerCoverageInput,
  options: ClassifyOptions = {}
): { bucket: ConsumerCoverageBucket; reason: string; nextStep: string } {
  if (STRUCTURAL_MANAGED_BROKERS.has(broker.brokerName)) {
    return {
      bucket: "managed",
      reason:
        "This broker requires hard verification or scales poorly per email, so NUKE routes it into managed help.",
      nextStep:
        "Upgrade to the concierge plan to have a human team work this broker for you.",
    };
  }

  if (broker.coverageStatus === "blocked") {
    return {
      bucket: "managed",
      reason: broker.topBlockerType
        ? `Recent automation runs were blocked by ${broker.topBlockerType.replace(/_/g, " ")}.`
        : "Recent automation runs hit a broker-specific blocker.",
      nextStep:
        "Pick up the chore yourself, or upgrade to the concierge plan to have a human team handle it.",
    };
  }

  if (broker.removalMethod === "email" || broker.removalMethod === "api") {
    return {
      bucket: "automatic",
      reason: "NUKE submits this broker without needing a chore from you.",
      nextStep: "No action needed — keep an eye on replies in the dashboard.",
    };
  }

  if (broker.removalMethod === "form" && broker.hasFormRunner) {
    if (options.hasOpenChore) {
      return {
        bucket: "chore",
        reason:
          "Automation reached the broker workflow but stopped at a step that needs you (CAPTCHA, confirmation link, or listing pick).",
        nextStep: "Open the broker chore from the dashboard and finish the last step.",
      };
    }

    return {
      bucket: "chore",
      reason:
        "Automation can run end-to-end most of the time, but this broker may pause for a CAPTCHA or confirmation link you'll need to finish.",
      nextStep:
        "We'll surface a chore in the dashboard if the broker stops at a step that needs you.",
    };
  }

  if (broker.removalMethod === "manual_link") {
    return {
      bucket: "chore",
      reason:
        "This broker is currently routed to a guided manual link rather than a runner.",
      nextStep: "Open the broker chore in the dashboard and complete the broker's own opt-out flow.",
    };
  }

  return {
    bucket: "chore",
    reason: "No broker-specific automation runner is registered yet for this broker.",
    nextStep: "Open the broker chore in the dashboard and complete the opt-out flow.",
  };
}

export function buildConsumerCoverageReport(
  brokers: ConsumerCoverageInput[],
  openChoreBrokerIds: Set<string>,
  generatedAt: string
): ConsumerCoverageReport {
  const rows: ConsumerBrokerCoverage[] = brokers
    .map((broker) => {
      const hasOpenChore = openChoreBrokerIds.has(broker.brokerId);
      const classification = classifyConsumerBucket(broker, { hasOpenChore });

      return {
        brokerId: broker.brokerId,
        brokerName: broker.brokerName,
        domain: broker.domain,
        category: broker.category,
        priority: broker.priority,
        removalMethod: broker.removalMethod,
        bucket: classification.bucket,
        bucketLabel: BUCKET_LABELS[classification.bucket],
        bucketReason: classification.reason,
        hasOpenChore,
        operatorCoverageStatus: broker.coverageStatus,
        topBlockerType: broker.topBlockerType,
        totalRequests: broker.totalRequests,
        completedCount: broker.completedCount,
        handoffCount: broker.handoffCount,
        nextStep: classification.nextStep,
      } satisfies ConsumerBrokerCoverage;
    })
    .sort(sortConsumerCoverageRows);

  const buckets: ConsumerCoverageBucketSummary[] = (
    ["automatic", "chore", "managed"] as const
  ).map((bucket) => {
    const filtered = rows.filter((row) => row.bucket === bucket);
    const outstanding = filtered.filter((row) => row.hasOpenChore).length;

    return {
      bucket,
      label: BUCKET_LABELS[bucket],
      description: BUCKET_DESCRIPTIONS[bucket],
      brokerCount: filtered.length,
      brokerNames: filtered.map((row) => row.brokerName),
      outstandingChoreCount: outstanding,
    } satisfies ConsumerCoverageBucketSummary;
  });

  const automaticCount = buckets.find((b) => b.bucket === "automatic")?.brokerCount ?? 0;
  const choreCount = buckets.find((b) => b.bucket === "chore")?.brokerCount ?? 0;
  const managedCount = buckets.find((b) => b.bucket === "managed")?.brokerCount ?? 0;
  const totalBrokerCount = rows.length;

  return {
    generatedAt,
    totalBrokerCount,
    automaticCount,
    choreCount,
    managedCount,
    automaticRate: totalBrokerCount === 0 ? 0 : Math.round((automaticCount * 100) / totalBrokerCount),
    outstandingChoreCount: rows.filter((row) => row.hasOpenChore).length,
    blockedBrokerNames: rows
      .filter((row) => row.bucket === "managed")
      .map((row) => row.brokerName),
    buckets,
    brokers: rows,
  };
}

function sortConsumerCoverageRows(
  left: ConsumerBrokerCoverage,
  right: ConsumerBrokerCoverage
): number {
  return (
    bucketRank(left.bucket) - bucketRank(right.bucket) ||
    Number(right.hasOpenChore) - Number(left.hasOpenChore) ||
    priorityRank(left.priority) - priorityRank(right.priority) ||
    left.brokerName.localeCompare(right.brokerName)
  );
}

function bucketRank(bucket: ConsumerCoverageBucket): number {
  switch (bucket) {
    case "managed":
      return 0;
    case "chore":
      return 1;
    case "automatic":
      return 2;
  }
}

function priorityRank(priority: string): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    default:
      return 2;
  }
}
