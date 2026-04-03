import type { RemovalAddress, RemovalProfileSnapshot } from "@/lib/removal/profile";

export interface BrokerDeletionEmail {
  subject: string;
  text: string;
  replyTo?: string;
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

function formatAddressList(addresses: RemovalAddress[]): string {
  if (addresses.length === 0) {
    return "Addresses: None provided";
  }

  const formatted = addresses
    .map((address) => [address.street, address.city, address.state, address.zip].filter(Boolean).join(", "))
    .filter(Boolean);

  return `Addresses: ${formatted.join(" | ")}`;
}
