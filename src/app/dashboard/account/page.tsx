import Link from "next/link";
import { PageContent, PageHeader } from "@/components/ui";

export default function AccountIndexPage() {
  return (
    <PageContent>
      <PageHeader
        title="Account"
        subtitle="Your profile and identifiers."
      />

      <section>
        <Link
          href="/dashboard/profile"
          className="text-base font-semibold"
          style={{ color: "var(--link)" }}
        >
          Profile and identifiers
        </Link>
        <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
          Update the personal data NUKE uses to find your listings — names, emails, phones, addresses, and optional identifiers.
        </p>
      </section>
    </PageContent>
  );
}
