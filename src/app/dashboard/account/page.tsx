import Link from "next/link";
import { PageContent, PageHeader } from "@/components/ui";

interface SubPage {
  href: string;
  title: string;
  summary: string;
}

const SUB_PAGES: SubPage[] = [
  {
    href: "/dashboard/plan",
    title: "Self-serve plan",
    summary:
      "Pick the plan that matches your account: NUKE handles automatic brokers, you finish quick chores, the concierge tier picks up the hard ones.",
  },
  {
    href: "/dashboard/managed-service",
    title: "Concierge pilot",
    summary:
      "Reserve a seat in the human-supported pilot cohort, mark payment, and track support checkpoints.",
  },
  {
    href: "/dashboard/profile",
    title: "Profile and identifiers",
    summary:
      "Update the personal data NUKE uses to find your listings — names, emails, phones, addresses, and optional identifiers.",
  },
];

export default function AccountIndexPage() {
  return (
    <PageContent>
      <PageHeader
        title="Account"
        subtitle="Plan, concierge enrollment, and your profile."
      />

      <section>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Pick a section below. These pages will gradually merge into a single
          account view — for now they live on their existing routes so workflows
          are unchanged.
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
