"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/http/client-response";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"register" | "login" | "profile">("register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Registration form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Profile form
  const [fullName, setFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuthState() {
      const res = await fetch("/api/auth/me");
      const payload = await parseJsonResponse<{ email: string; hasProfile: boolean }>(res);

      if (cancelled) {
        return;
      }

      if (!res.ok) {
        if (res.status !== 401) {
          setError(
            getResponseErrorMessage(
              payload,
              "Could not check your current session."
            )
          );
        }
        return;
      }

      if (!payload.data) {
        setError(
          getResponseErrorMessage(payload, "Could not read your current session.")
        );
        return;
      }

      const me = payload.data;
      if (cancelled) {
        return;
      }

      if (me.hasProfile) {
        router.replace("/dashboard");
        return;
      }

      setProfileEmail(me.email);
      setEmail(me.email);
      setStep("profile");
    }

    void hydrateAuthState();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseJsonResponse<{ error?: string }>(res);

    if (!res.ok) {
      setError(getResponseErrorMessage(payload, "Registration failed"));
      setLoading(false);
      return;
    }

    setProfileEmail(email);
    setStep("profile");
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await parseJsonResponse<{ error?: string }>(res);

    if (!res.ok) {
      setError(getResponseErrorMessage(payload, "Login failed"));
      setLoading(false);
      return;
    }

    const meRes = await fetch("/api/auth/me");
    const mePayload = await parseJsonResponse<{ email: string; hasProfile: boolean }>(meRes);
    if (!meRes.ok || !mePayload.data) {
      setError(
        getResponseErrorMessage(
          mePayload,
          "Login succeeded, but your session could not be loaded."
        )
      );
      setLoading(false);
      return;
    }

    const me = mePayload.data;
    if (!me.hasProfile) {
      setProfileEmail(me.email);
      setStep("profile");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  async function handleProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

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
      setError(
        getResponseErrorMessage(payload, "Failed to save profile")
      );
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex rounded-lg border border-gray-800 bg-gray-950 p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("register");
            }}
            className={`flex-1 rounded-md px-3 py-2 transition-colors ${
              step === "register"
                ? "bg-red-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("login");
            }}
            className={`flex-1 rounded-md px-3 py-2 transition-colors ${
              step === "login"
                ? "bg-red-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Log In
          </button>
        </div>

        <h1 className="text-3xl font-bold text-center">
          {step === "profile"
            ? "Your Information"
            : step === "login"
              ? "Welcome Back"
              : "Create Account"}
        </h1>
        <p className="text-gray-400 text-center text-sm">
          {step === "profile"
            ? "We need this to find and remove your data. All fields are encrypted."
            : step === "login"
              ? "Sign in to continue tracking and submitting removals"
              : "Sign up to start removing your data"}
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}

        {step === "register" ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating account…" : "Continue"}
            </button>
          </form>
        ) : step === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "Signing in…" : "Go to Dashboard"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleProfile} className="space-y-4">
            <input
              type="text"
              placeholder="Full legal name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <input
              type="email"
              placeholder="Primary email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <input
              type="tel"
              placeholder="Phone number (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <div className="border-t border-gray-800 pt-4">
              <p className="text-sm text-gray-500 mb-3">Address (optional)</p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="ZIP"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "Saving…" : "Save & Go to Dashboard"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
