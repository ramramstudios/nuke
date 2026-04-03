import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-6xl font-bold tracking-tight">
          <span className="text-red-500">NUKE</span>
        </h1>
        <p className="text-lg text-gray-400">
          Networked User Knowledge Eraser
        </p>
        <p className="text-gray-300 leading-relaxed">
          Discover where your personal data is exposed. Submit one request.
          Remove it from hundreds of data brokers. Track compliance. Repeat.
        </p>

        <div className="flex gap-4 justify-center pt-4">
          <Link
            href="/onboarding"
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-colors border border-gray-700"
          >
            Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-6 pt-12 text-sm text-gray-400">
          <div>
            <div className="text-2xl font-bold text-white">20+</div>
            <div>Brokers covered</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">1</div>
            <div>Request needed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">45d</div>
            <div>SLA tracking</div>
          </div>
        </div>
      </div>
    </main>
  );
}
