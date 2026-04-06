import type { RemovalAddress, RemovalProfileSnapshot } from "@/lib/removal/profile";

export interface BrokerDeletionEmail {
  subject: string;
  text: string;
  replyTo?: string;
}

export interface FollowUpEmailOptions {
  followUpStage: number;
  initialSentAt?: Date | null;
  previousFollowUpSentAt?: Date | null;
}

export function buildBrokerDeletionEmail(
  profile: RemovalProfileSnapshot,
  brokerName: string
): BrokerDeletionEmail {
  const displayName = profile.fullNames[0] || "Consumer";
  const sections = [
    `To Whom It May Concern,`,
    "",
    `I am requesting deletion of personal information associated with me from ${brokerName}, along with any suppression or opt-out steps required to prevent future sale or disclosure.`,
    "",
    `Please treat this as a consumer privacy request under applicable U.S. privacy laws, including the California Consumer Privacy Act where applicable.`,
    "",
    "Identifiers to match:",
    formatList(profile.fullNames, "Names"),
    formatList(profile.emails, "Emails"),
    formatList(profile.phones, "Phone numbers"),
    formatAddressList(profile.addresses),
    formatList(profile.advertisingIds, "Advertising IDs"),
    formatOptionalLine(profile.vin, "VIN"),
    "",
    "Please confirm when this request has been received and completed.",
    "",
    "Thank you,",
    displayName,
  ];

  return {
    subject: `Privacy deletion request for ${displayName}`,
    text: sections.join("\n"),
    replyTo: profile.emails[0],
  };
}

function formatList(values: string[], label: string): string {
  return `${label}: ${values.length > 0 ? values.join(", ") : "None provided"}`;
}

function formatOptionalLine(value: string | null, label: string): string {
  return `${label}: ${value ?? "None provided"}`;
}

export function buildFollowUpEmail(
  profile: RemovalProfileSnapshot,
  brokerName: string,
  options: FollowUpEmailOptions
): BrokerDeletionEmail {
  const displayName = profile.fullNames[0] || "Consumer";
  const followUpKind =
    options.followUpStage <= 1 ? "First follow-up" : "Second follow-up";
  const text = [
    `To Whom It May Concern,`,
    "",
    ...buildFollowUpOpening(
      brokerName,
      options.followUpStage,
      options.initialSentAt,
      options.previousFollowUpSentAt
    ),
    "",
    "Please treat this as a consumer privacy request under applicable U.S. privacy laws, including the California Consumer Privacy Act where applicable.",
    "",
    ...buildFollowUpAsk(options.followUpStage),
    "",
    "Identifiers to match:",
    formatList(profile.fullNames, "Names"),
    formatList(profile.emails, "Emails"),
    formatList(profile.phones, "Phone numbers"),
    formatAddressList(profile.addresses),
    formatList(profile.advertisingIds, "Advertising IDs"),
    formatOptionalLine(profile.vin, "VIN"),
    "",
    "Please confirm when this request has been received and completed.",
    "",
    "Thank you,",
    displayName,
  ].join("\n");

  return {
    subject: `${followUpKind}: Privacy deletion request for ${displayName}`,
    text,
    replyTo: profile.emails[0],
  };
}

function formatAddressList(addresses: RemovalAddress[]): string {
  if (addresses.length === 0) {
    return "Addresses: None provided";
  }

  const formatted = addresses
    .map((address) => [address.street, address.city, address.state, address.zip].filter(Boolean).join(", "))
    .filter(Boolean);

  return `Addresses: ${formatted.join(" | ")}`;
}

function buildFollowUpOpening(
  brokerName: string,
  followUpStage: number,
  initialSentAt?: Date | null,
  previousFollowUpSentAt?: Date | null
): string[] {
  const initialDate = formatEmailDate(initialSentAt);
  const previousFollowUpDate = formatEmailDate(previousFollowUpSentAt);

  if (followUpStage <= 1) {
    return [
      `I am following up on my privacy deletion request previously sent to ${brokerName}${initialDate ? ` on ${initialDate}` : ""}.`,
      "I have not yet received confirmation that the request has been received, routed, or completed.",
    ];
  }

  return [
    `This is my second follow-up regarding the privacy deletion request previously sent to ${brokerName}${initialDate ? ` on ${initialDate}` : ""}.`,
    previousFollowUpDate
      ? `I also sent a prior follow-up on ${previousFollowUpDate}, and I still have not received a substantive response or completion confirmation.`
      : "I still have not received a substantive response or completion confirmation.",
  ];
}

function buildFollowUpAsk(followUpStage: number): string[] {
  if (followUpStage <= 1) {
    return [
      "Please confirm receipt of the original request, let me know if you need any additional identifying information, and share the expected completion timeline.",
      "For convenience, I am including the relevant identifiers again below.",
    ];
  }

  return [
    "Please route this message to the correct privacy or compliance team if needed and confirm whether the request has been completed or what remaining action is required from me.",
    "For convenience, I am including the relevant identifiers again below.",
  ];
}

function formatEmailDate(value?: Date | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}
