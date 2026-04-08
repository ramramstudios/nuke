import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <AppNav />
      {children}
    </div>
  );
}
