import { decryptJSON, encryptJSON } from "@/lib/crypto/encrypt";

export interface RemovalAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface RemovalProfileSnapshot {
  fullNames: string[];
  emails: string[];
  phones: string[];
  addresses: RemovalAddress[];
  advertisingIds: string[];
  vin: string | null;
}

interface StoredProfileLike {
  fullNames: string;
  emails: string;
  phones: string;
  addresses: string;
  advertisingIds?: string | null;
  vin?: string | null;
}

interface LegacySnapshotShape {
  fullNames?: unknown;
  emails?: unknown;
  phones?: unknown;
  addresses?: unknown;
  advertisingIds?: unknown;
  vin?: unknown;
}

export function createRemovalProfileSnapshot(profile: StoredProfileLike): string {
  return encryptJSON(decodeStoredProfile(profile));
}

export function decodeRemovalProfileSnapshot(
  payloadSnapshot: string
): RemovalProfileSnapshot {
  const raw = decryptJSON<LegacySnapshotShape>(payloadSnapshot);

  return {
    fullNames: coerceStringArray(decodeLegacyField(raw.fullNames)),
    emails: coerceStringArray(decodeLegacyField(raw.emails)),
    phones: coerceStringArray(decodeLegacyField(raw.phones)),
    addresses: coerceAddressArray(decodeLegacyField(raw.addresses)),
    advertisingIds: coerceStringArray(decodeLegacyField(raw.advertisingIds)),
    vin: coerceOptionalString(decodeLegacyField(raw.vin)),
  };
}

export function getPrimaryRemovalEmail(
  profile: Pick<RemovalProfileSnapshot, "emails">
): string | null {
  const email = profile.emails.find(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  return email ?? null;
}

export function decodeStoredProfile(
  profile: StoredProfileLike
): RemovalProfileSnapshot {
  return {
    fullNames: decryptJSON<string[]>(profile.fullNames),
    emails: decryptJSON<string[]>(profile.emails),
    phones: decryptJSON<string[]>(profile.phones),
    addresses: decryptJSON<RemovalAddress[]>(profile.addresses),
    advertisingIds: profile.advertisingIds
      ? decryptJSON<string[]>(profile.advertisingIds)
      : [],
    vin: profile.vin ? decryptJSON<string>(profile.vin) : null,
  };
}

function decodeLegacyField(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return decryptJSON(value);
  } catch {
    return value;
  }
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function coerceAddressArray(value: unknown): RemovalAddress[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Partial<RemovalAddress> =>
      typeof item === "object" && item !== null
    )
    .map((item) => ({
      street: typeof item.street === "string" ? item.street : "",
      city: typeof item.city === "string" ? item.city : "",
      state: typeof item.state === "string" ? item.state : "",
      zip: typeof item.zip === "string" ? item.zip : "",
    }))
    .filter((item) => Object.values(item).some((part) => part.length > 0));
}

function coerceOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
