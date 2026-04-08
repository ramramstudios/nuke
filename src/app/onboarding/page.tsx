"use client";

import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";
import { ThemeToggle } from "@/components/AppNav";

type Step = "register" | "login" | "profile";
type FeedbackTone = "error" | "info";
type FieldName =
  | "email"
  | "password"
  | "fullName"
  | "profileEmail"
  | "phone"
  | "street"
  | "city"
  | "state"
  | "zip";

interface FeedbackState {
  text: string;
  tone: FeedbackTone;
}

const INITIAL_TOUCHED: Record<FieldName, boolean> = {
  email: false,
  password: false,
  fullName: false,
  profileEmail: false,
  phone: false,
  street: false,
  city: false,
  state: false,
  zip: false,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9()+.\-\s]{7,20}$/;
const STATE_PATTERN = /^[A-Za-z]{2}$/;
const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("register");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [supportsPasskeys, setSupportsPasskeys] = useState(false);
  const [submittedStep, setSubmittedStep] = useState<Step | null>(null);
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    ...INITIAL_TOUCHED,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setSupportsPasskeys(
        typeof window.PublicKeyCredential !== "undefined"
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuthState() {
      const res = await fetch("/api/auth/me");
      const payload = await parseJsonResponse<{ email: string; hasProfile: boolean }>(
        res
      );

      if (cancelled) {
        return;
      }

      if (!res.ok) {
        if (res.status !== 401) {
          setFeedback({
            text: getResponseErrorMessage(
              payload,
              "Could not check your current session."
            ),
            tone: "error",
          });
        }
        return;
      }

      if (!payload.data) {
        setFeedback({
          text: getResponseErrorMessage(
            payload,
            "Could not read your current session."
          ),
          tone: "error",
        });
        return;
      }

      const me = payload.data;
      if (me.hasProfile) {
        router.replace("/dashboard");
        return;
      }

      setProfileEmail(me.email);
      setEmail(me.email);
      setStep("profile");
      setSubmittedStep(null);
      setShowPassword(false);
    }

    void hydrateAuthState();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const authEmailError = validateEmail(email);
  const authPasswordError = validatePassword(password, step);
  const profileNameError = validateFullName(fullName);
  const profileEmailError = validateEmail(profileEmail);
  const profilePhoneError = validatePhone(phone);
  const profileStateError = validateStateValue(state);
  const profileZipError = validateZip(zip);

  const addressStarted = [street, city, state, zip].some((value) => value.trim().length > 0);
  const addressComplete = [street, city, state, zip].every((value) => value.trim().length > 0);
  const addressError =
    addressStarted && !addressComplete
      ? "Complete all address fields to include a physical address in broker requests."
      : null;

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

  function resetFormFeedback(nextStep: Step) {
    setFeedback(null);
    setSubmittedStep(null);
    setShowPassword(false);
    if (nextStep !== "profile") {
      setTouched((current) => ({
        ...current,
        email: false,
        password: false,
      }));
    }
  }

  function switchStep(nextStep: Step) {
    resetFormFeedback(nextStep);
    setStep(nextStep);
  }

  function announceUnavailableOption(option: "google" | "apple" | "passkey" | "recovery") {
    if (option === "passkey") {
      setFeedback({
        text: supportsPasskeys
          ? "This device supports passkeys, but passkey and biometric sign-in are not enabled on this deployment yet."
          : "Passkey and biometric sign-in are not available in this browser yet.",
        tone: "info",
      });
      return;
    }

    if (option === "recovery") {
      setFeedback({
        text: "Password recovery is not enabled in this build yet. If you are testing locally, create a fresh account or reset the local database.",
        tone: "info",
      });
      return;
    }

    setFeedback({
      text:
        option === "google"
          ? "Google sign-in is not enabled in this deployment yet."
          : "Apple sign-in is not enabled in this deployment yet.",
      tone: "info",
    });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedStep("register");
    setFeedback(null);

    if (authEmailError || authPasswordError) {
      markFieldsTouched(["email", "password"]);
      setFeedback({
        text: "Review the highlighted fields before creating your account.",
        tone: "error",
      });
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseJsonResponse<{ error?: string }>(res);

    if (!res.ok) {
      setFeedback({
        text: getResponseErrorMessage(payload, "Registration failed"),
        tone: "error",
      });
      setLoading(false);
      return;
    }

    setProfileEmail(email);
    setSubmittedStep(null);
    setShowPassword(false);
    setStep("profile");
    setLoading(false);
    setFeedback({
      text: "Account created. Add your details to start discovery and removals.",
      tone: "info",
    });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedStep("login");
    setFeedback(null);

    if (authEmailError || authPasswordError) {
      markFieldsTouched(["email", "password"]);
      setFeedback({
        text: "Enter a valid email and password before signing in.",
        tone: "error",
      });
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseJsonResponse<{ error?: string }>(res);

    if (!res.ok) {
      setFeedback({
        text: getResponseErrorMessage(payload, "Login failed"),
        tone: "error",
      });
      setLoading(false);
      return;
    }

    const meRes = await fetch("/api/auth/me");
    const mePayload = await parseJsonResponse<{ email: string; hasProfile: boolean }>(
      meRes
    );

    if (!meRes.ok || !mePayload.data) {
      setFeedback({
        text: getResponseErrorMessage(
          mePayload,
          "Login succeeded, but your session could not be loaded."
        ),
        tone: "error",
      });
      setLoading(false);
      return;
    }

    const me = mePayload.data;
    if (!me.hasProfile) {
      setProfileEmail(me.email);
      setSubmittedStep(null);
      setStep("profile");
      setLoading(false);
      setFeedback({
        text: "You are signed in. Finish your profile so NUKE can generate broker-ready requests.",
        tone: "info",
      });
      return;
    }

    router.push("/dashboard");
  }

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedStep("profile");
    setFeedback(null);

    if (profileNameError || profileEmailError || profilePhoneError || profileStateError || profileZipError || addressError) {
      markFieldsTouched([
        "fullName",
        "profileEmail",
        "phone",
        "street",
        "city",
        "state",
        "zip",
      ]);
      setFeedback({
        text: "Review the highlighted profile fields before continuing.",
        tone: "error",
      });
      return;
    }

    setLoading(true);

    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullNames: [fullName],
        emails: [profileEmail],
        phones: phone ? [phone] : [],
        addresses:
          street && city && state && zip
            ? [{ street, city, state, zip }]
            : [],
      }),
    });
    const payload = await parseJsonResponse<{ error?: string }>(res);

    if (!res.ok) {
      setFeedback({
        text: getResponseErrorMessage(payload, "Failed to save profile"),
        tone: "error",
      });
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  const showAuthEmailError = touched.email || submittedStep === step;
  const showAuthPasswordError = touched.password || submittedStep === step;
  const showProfileNameError = touched.fullName || submittedStep === "profile";
  const showProfileEmailError = touched.profileEmail || submittedStep === "profile";
  const showProfilePhoneError = touched.phone || submittedStep === "profile";
  const showProfileStateError = touched.state || submittedStep === "profile";
  const showProfileZipError = touched.zip || submittedStep === "profile";
  const showAddressError =
    touched.street ||
    touched.city ||
    touched.state ||
    touched.zip ||
    submittedStep === "profile";

  return (
    <main className="relative flex-1 overflow-hidden px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(248,113,113,0.08),transparent_28%)]" />
      <div className="relative mx-auto flex max-w-6xl justify-end pb-4">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto grid min-h-full w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="auth-enter rounded-[2rem] border p-6 backdrop-blur-sm sm:p-8 lg:p-10" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-200">
            Private by default
          </div>

          <div className="mt-6 max-w-2xl space-y-5">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--text)" }}>
              Privacy operations without the messy handoff.
            </h1>
            <p className="max-w-xl text-base leading-7 sm:text-lg" style={{ color: "var(--text-2)" }}>
              Create an account, verify your profile, and move from discovery to broker
              outreach inside one focused workspace built for clarity and auditability.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <TrustStat label="Encrypted intake" value="AES-256" />
            <TrustStat label="Broker tracking" value="Live status" />
            <TrustStat label="Retry policy" value="7d / 14d" />
          </div>

          <div className="mt-8 grid gap-3">
            <TrustPoint
              title="Clear next steps"
              body="Every auth state points you toward sign in, sign up, or finishing your profile without dead ends."
            />
            <TrustPoint
              title="High-signal feedback"
              body="Inline validation, focused error states, and keyboard-friendly controls reduce friction before a request is ever submitted."
            />
            <TrustPoint
              title="Secure foundations"
              body="Sessions stay cookie-based, sensitive profile data is encrypted at rest, and broker outreach only starts after you confirm your details."
            />
          </div>
        </section>

        <section className="auth-enter rounded-[2rem] border p-5 shadow-xl backdrop-blur-xl sm:p-7" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
          <div className="rounded-[1.5rem] border p-4 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-red-300">
                  {step === "profile" ? "Complete setup" : "Secure account access"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>
                  {step === "register"
                    ? "Create your account"
                    : step === "login"
                      ? "Welcome back"
                      : "Finish your profile"}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  {step === "register"
                    ? "Start with email and password, then add the personal details needed for broker removal requests."
                    : step === "login"
                      ? "Sign in to review active requests, delivery status, and any follow-up actions."
                      : "These details stay encrypted and are used to match you against broker records accurately."}
                </p>
              </div>
              {step !== "profile" && (
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  Cookie session protected
                </div>
              )}
            </div>

            {step !== "profile" && (
              <>
                <div
                  className="mt-6 grid grid-cols-2 rounded-2xl border p-1"
                  style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
                  role="tablist"
                  aria-label="Authentication mode"
                >
                  <AuthModeButton
                    active={step === "register"}
                    label="Create account"
                    onClick={() => switchStep("register")}
                  />
                  <AuthModeButton
                    active={step === "login"}
                    label="Log in"
                    onClick={() => switchStep("login")}
                  />
                </div>

                <div className="mt-6 space-y-3">
                  <AlternativeAuthButton
                    badge="Soon"
                    description="Use your work or personal Google account."
                    label="Continue with Google"
                    onClick={() => announceUnavailableOption("google")}
                  />
                  <AlternativeAuthButton
                    badge="Soon"
                    description="Fast sign-in for Apple users on supported devices."
                    label="Continue with Apple"
                    onClick={() => announceUnavailableOption("apple")}
                  />
                  <AlternativeAuthButton
                    badge={supportsPasskeys ? "Device ready" : "Unsupported"}
                    description="Use a passkey or biometric factor when deployment support is enabled."
                    label="Use a passkey"
                    onClick={() => announceUnavailableOption("passkey")}
                  />
                </div>

                <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-faint)" }}>
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                  <span>Email and password</span>
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>
              </>
            )}

            {feedback && (
              <div
                aria-live="polite"
                className="mb-6 rounded-2xl border px-4 py-3 text-sm leading-6"
                style={feedback.tone === "error"
                  ? { borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "rgb(252,165,165)" }
                  : { borderColor: "rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.08)", color: "rgb(186,230,253)" }
                }
                role={feedback.tone === "error" ? "alert" : "status"}
              >
                {feedback.text}
              </div>
            )}

            {step === "register" ? (
              <form
                noValidate
                onSubmit={handleRegister}
                className="space-y-5"
                aria-busy={loading}
              >
                <AuthField
                  autoComplete="email"
                  error={showAuthEmailError ? authEmailError : null}
                  helperText="Use the email you want tied to removal requests and status updates."
                  label="Email address"
                  onBlur={() => markTouched("email")}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFeedback(null);
                  }}
                  placeholder="name@example.com"
                  required
                  type="email"
                  value={email}
                />
                <AuthField
                  autoComplete="new-password"
                  error={showAuthPasswordError ? authPasswordError : null}
                  helperText="At least 8 characters. Longer passwords are better."
                  label="Password"
                  onBlur={() => markTouched("password")}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFeedback(null);
                  }}
                  placeholder="Create a strong password"
                  required
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="rounded-lg px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400" style={{ color: "var(--text-2)" }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  }
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-red-500 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(239,68,68,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {loading ? "Creating account..." : "Continue securely"}
                </button>
                <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => switchStep("login")}
                    className="font-medium underline underline-offset-4 transition-colors hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400" style={{ color: "var(--text)", textDecorationColor: "var(--border-2)" }}
                  >
                    Sign in instead
                  </button>
                </p>
              </form>
            ) : step === "login" ? (
              <form
                noValidate
                onSubmit={handleLogin}
                className="space-y-5"
                aria-busy={loading}
              >
                <AuthField
                  autoComplete="email"
                  error={showAuthEmailError ? authEmailError : null}
                  helperText="Use the same email you registered with."
                  label="Email address"
                  onBlur={() => markTouched("email")}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFeedback(null);
                  }}
                  placeholder="name@example.com"
                  required
                  type="email"
                  value={email}
                />
                <AuthField
                  autoComplete="current-password"
                  error={showAuthPasswordError ? authPasswordError : null}
                  helperText="Your password stays on this device until it is sent securely."
                  label="Password"
                  onBlur={() => markTouched("password")}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFeedback(null);
                  }}
                  placeholder="Enter your password"
                  required
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="rounded-lg px-2 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400" style={{ color: "var(--text-2)" }}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  }
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span style={{ color: "var(--text-faint)" }}>
                    Fastest path back to your dashboard.
                  </span>
                  <button
                    type="button"
                    onClick={() => announceUnavailableOption("recovery")}
                    className="font-medium underline underline-offset-4 transition-colors hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400" style={{ color: "var(--text)", textDecorationColor: "var(--border-2)" }}
                  >
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-red-500 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(239,68,68,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {loading ? "Signing in..." : "Go to dashboard"}
                </button>
                <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  New here?{" "}
                  <button
                    type="button"
                    onClick={() => switchStep("register")}
                    className="font-medium underline underline-offset-4 transition-colors hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400" style={{ color: "var(--text)", textDecorationColor: "var(--border-2)" }}
                  >
                    Create an account
                  </button>
                </p>
              </form>
            ) : (
              <form
                noValidate
                onSubmit={handleProfile}
                className="space-y-6"
                aria-busy={loading}
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <AuthField
                      autoComplete="name"
                      error={showProfileNameError ? profileNameError : null}
                      helperText="Use the name most likely to appear in broker listings."
                      label="Full legal name"
                      onBlur={() => markTouched("fullName")}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setFeedback(null);
                      }}
                      placeholder="Jordan Avery"
                      required
                      value={fullName}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <AuthField
                      autoComplete="email"
                      error={showProfileEmailError ? profileEmailError : null}
                      helperText="This stays tied to account recovery and broker correspondence."
                      label="Primary email"
                      onBlur={() => markTouched("profileEmail")}
                      onChange={(event) => {
                        setProfileEmail(event.target.value);
                        setFeedback(null);
                      }}
                      placeholder="name@example.com"
                      required
                      type="email"
                      value={profileEmail}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <AuthField
                      autoComplete="tel"
                      error={showProfilePhoneError ? profilePhoneError : null}
                      helperText="Optional, but helpful for brokers that match records by phone."
                      label="Phone number"
                      onBlur={() => markTouched("phone")}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setFeedback(null);
                      }}
                      placeholder="(312) 555-0123"
                      type="tel"
                      value={phone}
                    />
                  </div>
                </div>

                <FormSection
                  title="Address details"
                  description="Optional, but useful for people-search brokers. Leave it blank unless you want us to include it."
                >
                  <AuthField
                    autoComplete="street-address"
                    error={showAddressError && addressError ? addressError : null}
                    helperText="Street address"
                    label="Street"
                    onBlur={() => markTouched("street")}
                    onChange={(event) => {
                      setStreet(event.target.value);
                      setFeedback(null);
                    }}
                    placeholder="123 Main St"
                    value={street}
                  />
                  <div className="grid gap-4 sm:grid-cols-[1.3fr_0.8fr_0.9fr]">
                    <AuthField
                      autoComplete="address-level2"
                      error={showAddressError && addressError ? addressError : null}
                      helperText="City"
                      label="City"
                      onBlur={() => markTouched("city")}
                      onChange={(event) => {
                        setCity(event.target.value);
                        setFeedback(null);
                      }}
                      placeholder="Chicago"
                      value={city}
                    />
                    <AuthField
                      autoComplete="address-level1"
                      error={showProfileStateError ? profileStateError : null}
                      helperText="State"
                      label="State"
                      maxLength={2}
                      onBlur={() => markTouched("state")}
                      onChange={(event) => {
                        setState(event.target.value.toUpperCase());
                        setFeedback(null);
                      }}
                      placeholder="IL"
                      value={state}
                    />
                    <AuthField
                      autoComplete="postal-code"
                      error={showProfileZipError ? profileZipError : null}
                      helperText="ZIP"
                      label="ZIP"
                      onBlur={() => markTouched("zip")}
                      onChange={(event) => {
                        setZip(event.target.value);
                        setFeedback(null);
                      }}
                      placeholder="60601"
                      value={zip}
                    />
                  </div>
                </FormSection>

                <div className="rounded-2xl border px-4 py-3 text-sm leading-6" style={{ borderColor: "rgba(16,185,129,0.15)", background: "rgba(16,185,129,0.08)", color: "rgb(167,243,208)" }}>
                  Your profile details are encrypted before they are stored and only used to
                  assemble broker-facing deletion requests.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-red-500 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(239,68,68,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {loading ? "Saving profile..." : "Save and continue"}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="rounded-[1rem] px-4 py-3 text-sm font-medium transition-all duration-200"
      style={active
        ? { background: "var(--text)", color: "var(--bg)", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }
        : { color: "var(--text-muted)" }
      }
    >
      {label}
    </button>
  );
}

function AlternativeAuthButton({ badge, description, label, onClick }: { badge: string; description: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-all duration-200"
      style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{label}</p>
        <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{description}</p>
      </div>
      <span className="rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        {badge}
      </span>
    </button>
  );
}

function AuthField({
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
        <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {label}
        </label>
        {inputProps.required && (
          <span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
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
          className={`w-full rounded-2xl px-4 py-3.5 text-base transition-all duration-200 ${trailing ? "pr-20" : ""}`}
          style={{
            background: "var(--bg-subtle)",
            border: `1px solid ${error ? "rgba(248,113,113,0.6)" : "var(--border)"}`,
            color: "var(--text)",
          }}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-sm leading-6 text-red-400">{error}</p>
      ) : helperText ? (
        <p id={hintId} className="text-sm leading-6" style={{ color: "var(--text-faint)" }}>{helperText}</p>
      ) : null}
    </div>
  );
}

function FormSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <section className="space-y-4 rounded-2xl border p-4 sm:p-5" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
      <div>
        <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{description}</p>
      </div>
      {children}
    </section>
  );
}

function TrustStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
      <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "var(--text-faint)" }}>{label}</p>
      <p className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

function TrustPoint({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</p>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{body}</p>
    </div>
  );
}

function validateEmail(value: string): string | null {
  if (!value.trim()) {
    return "Enter an email address.";
  }

  if (!EMAIL_PATTERN.test(value.trim())) {
    return "Use a valid email address like name@example.com.";
  }

  return null;
}

function validatePassword(value: string, step: Step): string | null {
  if (!value) {
    return "Enter your password.";
  }

  if (step === "register" && value.length < 8) {
    return "Use at least 8 characters for a stronger password.";
  }

  return null;
}

function validateFullName(value: string): string | null {
  if (!value.trim()) {
    return "Enter your full legal name.";
  }

  return null;
}

function validatePhone(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  if (!PHONE_PATTERN.test(value.trim())) {
    return "Use digits and standard phone punctuation only.";
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
