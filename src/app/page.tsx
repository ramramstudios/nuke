import Link from "next/link";
import { ThemeToggle } from "@/components/AppNav";

export default function Home() {
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold tracking-tight" style={{ color: "var(--accent)" }}>
            NUKE
          </h1>
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            Networked User Knowledge Eraser
          </p>
        </div>

        <p className="text-lg leading-relaxed" style={{ color: "var(--text-2)" }}>
          Discover where your personal data is exposed. Submit one request.
          Remove it from hundreds of data brokers. Track compliance. Repeat.
        </p>

        <div className="flex gap-4 justify-center pt-2">
          <Link
            href="/onboarding"
            className="px-6 py-3 font-medium rounded-xl transition-colors text-white"
            style={{ background: "var(--accent)" }}
          >
            Get Started
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 font-medium rounded-xl transition-colors border"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            Dashboard
          </Link>
        </div>

        <div
          className="grid grid-cols-3 gap-6 pt-10 border-t text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <div>
            <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>20+</div>
            <div>Brokers covered</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>1</div>
            <div>Request needed</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>45d</div>
            <div>SLA tracking</div>
          </div>
        </div>
      </div>
    </main>
  );
}
