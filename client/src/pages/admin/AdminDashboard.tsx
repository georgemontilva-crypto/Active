import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  KeyRound,
  Loader2,
  Package,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { Link } from "wouter";

const RESULT_LABEL: Record<string, string> = {
  valid: "Authentic",
  not_found: "Not found",
  limit_reached: "Limit reached",
  disabled: "Disabled",
};

export default function AdminDashboard() {
  const overview = trpc.adminAuth.dashboardOverview.useQuery(undefined, { retry: false });
  const c = overview.data?.counts;

  const tiles = [
    { label: "Codes issued", value: c?.totalCodes, icon: KeyRound, href: "/admin/codes" },
    { label: "Codes used at least once", value: c?.usedCodes, icon: CheckCircle2 },
    { label: "Codes fully spent", value: c?.spentCodes, icon: ShieldX },
    { label: "Successful checks", value: c?.validLogs, icon: CheckCircle2, href: "/admin/logs" },
    { label: "Blocked (over limit)", value: c?.blockedLogs, icon: ShieldAlert, href: "/admin/logs" },
    { label: "Unknown codes tried", value: c?.notFoundLogs, icon: AlertTriangle, href: "/admin/logs" },
    { label: "Products", value: c?.totalProducts, icon: Package, href: "/admin/products" },
    { label: "Lab reports", value: c?.totalReports, icon: FileText, href: "/admin/lab-reports" },
  ];

  return (
    <AdminLayout title="Dashboard">
      {overview.data && !overview.data.storage.configured && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-200">
          <p className="font-semibold">File storage is not configured</p>
          <p className="mt-1">
            Uploading lab reports and product images will fail until these
            environment variables are set:{" "}
            <span className="font-mono text-xs">
              {overview.data.storage.missing.join(", ")}
            </span>
          </p>
        </div>
      )}

      {overview.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => {
              const body = (
                <div className="h-full rounded-2xl border border-white/10 bg-[#130e1e] p-5">
                  <t.icon className="h-5 w-5 text-white/40" />
                  <div className="mt-3 font-display text-3xl font-bold tabular-nums">
                    {t.value ?? 0}
                  </div>
                  <div className="mt-0.5 text-sm text-white/50">{t.label}</div>
                </div>
              );
              return t.href ? (
                <Link key={t.label} href={t.href} className="block">
                  {body}
                </Link>
              ) : (
                <div key={t.label}>{body}</div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#130e1e]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="font-display text-lg font-semibold">Latest checks</h2>
              <Link
                href="/admin/logs"
                className="text-sm font-medium text-white/40 underline-offset-4 hover:text-[#f5e400] hover:underline"
              >
                View all →
              </Link>
            </div>
            <ul className="divide-y divide-white/10">
              {overview.data?.recentLogs.length ? (
                overview.data.recentLogs.map((l) => (
                  <li key={l.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                    <span className="rounded-md bg-[#0a0812] px-2 py-1 font-mono text-xs font-semibold">
                      {l.code}
                    </span>
                    <span
                      className={
                        l.result === "valid"
                          ? "rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300"
                          : l.result === "limit_reached"
                            ? "rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200"
                            : "rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-300"
                      }
                    >
                      {RESULT_LABEL[l.result] ?? l.result}
                    </span>
                    {l.attemptNumber != null && (
                      <span className="text-xs text-white/40">check #{l.attemptNumber}</span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-white/40">
                      {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                    </span>
                  </li>
                ))
              ) : (
                <li className="px-5 py-10 text-center text-sm text-white/40">
                  No verification attempts yet.
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
