import Link from "next/link";
import { PageContent, PageHeader } from "@/components/ui";

interface SubPage {
  href: string;
  title: string;
  summary: string;
}

const SUB_PAGES: SubPage[] = [
  {
    href: "/dashboard/metrics",
    title: "Coverage and metrics",
    summary:
      "See which brokers NUKE submits automatically, which need a chore, and which are blocked. Reply rate, completion rate, and SLA aging are tracked here.",
  },
  {
    href: "/dashboard/scans",
    title: "Scans",
    summary:
      "Run a new scan to discover where your data appears across the broker registry, and review past scan results.",
  },
  {
    href: "/dashboard/review",
    title: "Operator review queue",
    summary:
      "Inbound broker replies that the classifier is not confident about. Resolve ambiguous replies or flag them for action.",
  },
];

export default function BrokersIndexPage() {
  return (
    <PageContent>
      <PageHeader
        title="Brokers"
        subtitle="Everything related to broker coverage, discovery, and reply review."
      />

      <section>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Pick a section below. The links you see here will gradually merge into a
          single broker view in the next pass — for now they live on their existing
          routes so workflows are unchanged.
        </p>

        <ul className="mt-6 space-y-5 list-none p-0">
          {SUB_PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="text-base font-semibold"
                style={{ color: "var(--link)" }}
              >
                {page.title}
              </Link>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-2)" }}
              >
                {page.summary}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </PageContent>
  );
}
