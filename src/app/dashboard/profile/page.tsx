"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";

type FeedbackTone = "error" | "success" | "info";
type FieldName =
  | "fullNames"
  | "emails"
  | "phones"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "advertisingIds"
  | "vin";

interface FeedbackState {
  text: string;
  tone: FeedbackTone;
}

interface RemovalAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface ProfileResponse {
  accountEmail: string;
  profile: {
    fullNames: string[];
    emails: string[];
    phones: string[];
    addresses: RemovalAddress[];
    advertisingIds: string[];
    vin: string | null;
  };
  profileUpdatedAt: string;
  lastSubmittedAt: string | null;
}

interface SaveResponse {
  profileId: string;
  status: string;
  profileUpdatedAt: string;
}

const INITIAL_TOUCHED: Record<FieldName, boolean> = {
  fullNames: false,
  emails: false,
  phones: false,
  street: false,
  city: false,
  state: false,
  zip: false,
  advertisingIds: false,
  vin: false,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9()+.\-\s]{7,20}$/;
const STATE_PATTERN = /^[A-Za-z]{2}$/;
const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    ...INITIAL_TOUCHED,
  });

  const [fullNamesText, setFullNamesText] = useState("");
  const [emailsText, setEmailsText] = useState("");
  const [phonesText, setPhonesText] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [advertisingIdsText, setAdvertisingIdsText] = useState("");
  const [vin, setVin] = useState("");

  const hydrateProfile = (data: ProfileResponse) => {
    const address = data.profile.addresses[0] ?? {
      street: "",
      city: "",
      state: "",
      zip: "",
    };

    setAccountEmail(data.accountEmail);
    setProfileUpdatedAt(data.profileUpdatedAt);
    setLastSubmittedAt(data.lastSubmittedAt);
    setFullNamesText(joinLines(data.profile.fullNames));
    setEmailsText(joinLines(data.profile.emails));
    setPhonesText(joinLines(data.profile.phones));
    setStreet(address.street);
    setCity(address.city);
    setState(address.state);
    setZip(address.zip);
    setAdvertisingIdsText(joinLines(data.profile.advertisingIds));
    setVin(data.profile.vin ?? "");
    setTouched({ ...INITIAL_TOUCHED });
  };

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const res = await fetch("/api/intake", { cache: "no-store" });
      const payload = await parseJsonResponse<ProfileResponse>(res);

      if (cancelled) {
        return;
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          router.replace("/onboarding");
          return;
        }

        setFeedback({
          text: getResponseErrorMessage(payload, "Could not load your profile."),
          tone: "error",
        });
        setLoading(false);
        return;
      }

      if (!payload.data) {
        setFeedback({
          text: getResponseErrorMessage(payload, "Could not read your profile."),
          tone: "error",
        });
        setLoading(false);
        return;
      }

      hydrateProfile(payload.data);
      setFeedback(null);
      setLoading(false);
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function markTouched(field: FieldName) {
    setTouched((current) =>
      current[field] ? current : { ...current, [field]: true }
    );
  }

  function markFieldsTouched(fields: FieldName[]) {
    setTouched((current) => {
      const next = { ...current };
      for (const field of fields) {
        next[field] = true;
      }
      return next;
    });
  }

  const fullNames = parseLineList(fullNamesText);
  const emails = parseLineList(emailsText);
  const phones = parseLineList(phonesText);
  const advertisingIds = parseLineList(advertisingIdsText);

  const fullNamesError = validateFullNames(fullNames);
  const emailsError = validateEmailList(emails);
  const phonesError = validatePhoneList(phones);
  const stateError = validateStateValue(state);
  const zipError = validateZip(zip);
  const addressStarted = [street, city, state, zip].some((value) => value.trim().length > 0);
  const addressComplete = [street, city, state, zip].every((value) => value.trim().length > 0);
  const addressError =
    addressStarted && !addressComplete
      ? "Complete all address fields to keep the saved address usable in broker requests."
      : null;

  const showFullNamesError = touched.fullNames || saving;
  const showEmailsError = touched.emails || saving;
  const showPhonesError = touched.phones || saving;
  const showStateError = touched.state || saving;
  const showZipError = touched.zip || saving;
  const showAddressError =
    touched.street || touched.city || touched.state || touched.zip || saving;

  async function handleLogout() {
    setActionLoading("logout");
    await fetch("/api/auth/logout", { method: "POST" });
    setActionLoading("");
    router.push("/onboarding");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (
      fullNamesError ||
      emailsError ||
      phonesError ||
      stateError ||
      zipError ||
      addressError
    ) {
      markFieldsTouched([
        "fullNames",
        "emails",
        "phones",
        "street",
        "city",
        "state",
        "zip",
      ]);
      setFeedback({
        text: "Review the highlighted profile fields before saving.",
        tone: "error",
      });
      return;
    }

    setSaving(true);

    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullNames,
        emails,
        phones,
        addresses: addressComplete
          ? [{ street: street.trim(), city: city.trim(), state: state.trim(), zip: zip.trim() }]
          : [],
        advertisingIds,
        vin: vin.trim() || undefined,
      }),
    });
    const payload = await parseJsonResponse<SaveResponse>(res);

    if (!res.ok) {
      setFeedback({
        text: getResponseErrorMessage(payload, "Failed to save your profile."),
        tone: "error",
      });
      setSaving(false);
      return;
    }

    setProfileUpdatedAt(payload.data?.profileUpdatedAt ?? new Date().toISOString());
    setSaving(false);
    setFeedback({
      text: lastSubmittedAt
        ? "Profile saved. Future broker requests will use this updated information, but requests already sent keep the older snapshot until you submit removal again from the dashboard."
        : "Profile saved. This information will be used the next time you submit broker removals.",
      tone: "success",
    });
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading profile…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-gray-400 text-sm mt-1">
            Review and edit the personal details NUKE uses for future broker requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/dashboard/scans"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            View Scan Results
          </Link>
          <Link
            href="/dashboard/review"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Review Queue
          </Link>
          <Link
            href="/dashboard/metrics"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Metrics
          </Link>
          <Link
            href="/dashboard/managed-service"
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 transition-colors"
          >
            Concierge Pilot
          </Link>
          <button
            onClick={handleLogout}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            {actionLoading === "logout" ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            feedback.tone === "error"
              ? "border border-red-800 bg-red-950/30 text-red-300"
              : feedback.tone === "success"
                ? "border border-emerald-800 bg-emerald-950/30 text-emerald-200"
                : "border border-blue-800 bg-blue-950/30 text-blue-200"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard
          title="Account and Reply-To Context"
          description="NUKE account access and broker-facing contact info can be different on purpose."
        >
          <DetailRow label="Login email" value={accountEmail} />
          <DetailRow
            label="Primary broker reply-to"
            value={emails[0] ?? "Add at least one profile email below"}
          />
          <p className="text-sm leading-6 text-slate-400">
            The first email listed in your profile is used as the reply-to address for
            broker emails today. If brokers answer there, NUKE may not see the reply
            unless it reaches the app’s inbound pipeline.
          </p>
        </InfoCard>

        <InfoCard
          title="Snapshot Rules"
          description="Profile edits do not rewrite messages or forms that brokers already received."
        >
          <p className="text-sm leading-6 text-slate-300">
            {lastSubmittedAt
              ? `Your most recent broker submission used a saved profile snapshot from ${formatDateTime(
                  lastSubmittedAt
                )}. Save changes here first, then submit removal again from the dashboard if you want brokers to receive updated information.`
              : "You have not submitted broker removals yet. Save your profile here and NUKE will use it the next time you submit removals."}
          </p>
          {profileUpdatedAt && (
            <p className="text-xs leading-5 text-slate-500">
              Last profile save: {formatDateTime(profileUpdatedAt)}
            </p>
          )}
        </InfoCard>
      </div>

      <form noValidate onSubmit={handleSave} className="space-y-6" aria-busy={saving}>
        <FormSection
          title="Names and contact details"
          description="Use one line per entry. The first email becomes the current broker reply-to address."
        >
          <ProfileTextarea
            error={showFullNamesError ? fullNamesError : null}
            helperText="One legal or commonly listed name per line."
            label="Names used in broker records"
            onBlur={() => markTouched("fullNames")}
            onChange={(event) => {
              setFullNamesText(event.target.value);
              setFeedback(null);
            }}
            placeholder={"Christopher Strickland\nChris Strickland"}
            required
            rows={3}
            value={fullNamesText}
          />
          <ProfileTextarea
            error={showEmailsError ? emailsError : null}
            helperText="One email per line. The first one is used as the reply-to address."
            label="Emails used in broker records"
            onBlur={() => markTouched("emails")}
            onChange={(event) => {
              setEmailsText(event.target.value);
              setFeedback(null);
            }}
            placeholder={"cmstrickland@gmail.com\nalias@example.com"}
            required
            rows={3}
            value={emailsText}
          />
          <ProfileTextarea
            error={showPhonesError ? phonesError : null}
            helperText="Optional. Add one phone number per line if brokers may match on phone."
            label="Phone numbers"
            onBlur={() => markTouched("phones")}
            onChange={(event) => {
              setPhonesText(event.target.value);
              setFeedback(null);
            }}
            placeholder={"(312) 555-0123\n+1 850 555 0147"}
            rows={3}
            value={phonesText}
          />
        </FormSection>

        <FormSection
          title="Address details"
          description="Optional, but useful for people-search brokers. Save all address fields together if you want NUKE to include an address."
        >
          <ProfileField
            autoComplete="street-address"
            error={showAddressError ? addressError : null}
            helperText="Street address"
            label="Street"
            onBlur={() => markTouched("street")}
            onChange={(event) => {
              setStreet(event.target.value);
              setFeedback(null);
            }}
            placeholder="1108 Carissa Dr"
            value={street}
          />
          <div className="grid gap-4 sm:grid-cols-[1.3fr_0.8fr_0.9fr]">
            <ProfileField
              autoComplete="address-level2"
              error={showAddressError ? addressError : null}
              helperText="City"
              label="City"
              onBlur={() => markTouched("city")}
              onChange={(event) => {
                setCity(event.target.value);
                setFeedback(null);
              }}
              placeholder="Tallahassee"
              value={city}
            />
            <ProfileField
              autoComplete="address-level1"
              error={showStateError ? stateError : null}
              helperText="State"
              label="State"
              maxLength={2}
              onBlur={() => markTouched("state")}
              onChange={(event) => {
                setState(event.target.value.toUpperCase());
                setFeedback(null);
              }}
              placeholder="FL"
              value={state}
            />
            <ProfileField
              autoComplete="postal-code"
              error={showZipError ? zipError : null}
              helperText="ZIP"
              label="ZIP"
              onBlur={() => markTouched("zip")}
              onChange={(event) => {
                setZip(event.target.value);
                setFeedback(null);
              }}
              placeholder="32308"
              value={zip}
            />
          </div>
        </FormSection>

        <FormSection
          title="Advanced identifiers"
          description="Optional identifiers for brokers that match on device or vehicle data."
        >
          <ProfileTextarea
            error={null}
            helperText="Optional. One advertising ID per line."
            label="Advertising IDs"
            onBlur={() => markTouched("advertisingIds")}
            onChange={(event) => {
              setAdvertisingIdsText(event.target.value);
              setFeedback(null);
            }}
            placeholder={"AEBE52E7-03EE-455A-B3C4-E57283966239"}
            rows={3}
            value={advertisingIdsText}
          />
          <ProfileField
            error={null}
            helperText="Optional vehicle identifier."
            label="VIN"
            onBlur={() => markTouched("vin")}
            onChange={(event) => {
              setVin(event.target.value.toUpperCase());
              setFeedback(null);
            }}
            placeholder="1HGCM82633A123456"
            value={vin}
          />
        </FormSection>

        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3 text-sm leading-6 text-emerald-100">
          Your profile details are encrypted before they are stored. Editing them here
          updates future broker requests, not requests that have already been sent.
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-400">
            After saving, return to the dashboard when you’re ready to submit another
            broker removal batch with the updated profile snapshot.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-800"
            >
              Back to dashboard
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(239,68,68,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {saving ? "Saving profile…" : "Save profile"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function InfoCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white break-all">{value}</p>
    </div>
  );
}

function FormSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="space-y-4 rounded-[1.5rem] border border-white/8 bg-white/[0.02] p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ProfileField({
  error,
  helperText,
  label,
  trailing,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  error?: string | null;
  helperText?: string;
  label: string;
  trailing?: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [helperText ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-white">
          {label}
        </label>
        {inputProps.required && (
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Required
          </span>
        )}
      </div>
      <div className="relative">
        <input
          {...inputProps}
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          className={`w-full rounded-2xl border bg-slate-950/90 px-4 py-3.5 text-base text-white placeholder:text-slate-500 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 ${
            trailing ? "pr-20" : ""
          } ${
            error
              ? "border-red-400/60 shadow-[0_0_0_1px_rgba(248,113,113,0.2)]"
              : "border-white/10 hover:border-white/20 focus:border-red-400/60"
          }`}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-sm leading-6 text-red-200">
          {error}
        </p>
      ) : helperText ? (
        <p id={hintId} className="text-sm leading-6 text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function ProfileTextarea({
  error,
  helperText,
  label,
  ...textareaProps
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string | null;
  helperText?: string;
  label: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [helperText ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-white">
          {label}
        </label>
        {textareaProps.required && (
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Required
          </span>
        )}
      </div>
      <textarea
        {...textareaProps}
        id={id}
        aria-describedby={describedBy || undefined}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-2xl border bg-slate-950/90 px-4 py-3.5 text-base text-white placeholder:text-slate-500 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 ${
          error
            ? "border-red-400/60 shadow-[0_0_0_1px_rgba(248,113,113,0.2)]"
            : "border-white/10 hover:border-white/20 focus:border-red-400/60"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-sm leading-6 text-red-200">
          {error}
        </p>
      ) : helperText ? (
        <p id={hintId} className="text-sm leading-6 text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function parseLineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(values: string[]) {
  return values.join("\n");
}

function validateFullNames(values: string[]): string | null {
  if (values.length === 0) {
    return "Add at least one name used in broker records.";
  }

  return null;
}

function validateEmailList(values: string[]): string | null {
  if (values.length === 0) {
    return "Add at least one email address.";
  }

  if (values.some((value) => !EMAIL_PATTERN.test(value))) {
    return "Use one valid email address per line.";
  }

  return null;
}

function validatePhoneList(values: string[]): string | null {
  if (values.some((value) => !PHONE_PATTERN.test(value))) {
    return "Use one valid phone number per line with digits and standard punctuation.";
  }

  return null;
}

function validateStateValue(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  if (!STATE_PATTERN.test(value.trim())) {
    return "Use the 2-letter state code.";
  }

  return null;
}

function validateZip(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  if (!ZIP_PATTERN.test(value.trim())) {
    return "Use a 5-digit ZIP code or ZIP+4.";
  }

  return null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
