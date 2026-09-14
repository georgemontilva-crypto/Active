import { useAdminGuard } from "@/hooks/useAdminAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "@shared/const";
import {
  BarChart3,
  FlaskConical,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const NAV = [
  { label: "Dashboard", href: "/admin", icon: BarChart3 },
  { label: "Verification Codes", href: "/admin/codes", icon: KeyRound },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Lab Reports", href: "/admin/lab-reports", icon: FlaskConical },
  { label: "Query Logs", href: "/admin/logs", icon: ScrollText },
  { label: "Admin Users", href: "/admin/users", icon: Users },
];

export function AdminLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { admin, isLoading } = useAdminGuard();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const logout = trpc.adminAuth.logout.useMutation({
    onSuccess: async () => {
      await utils.adminAuth.me.invalidate();
      navigate("/admin/login");
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0812]">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </div>
    );
  }
  if (!admin) return null;

  const isActive = (href: string) =>
    href === "/admin" ? location === "/admin" : location.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0812] text-white">
      <aside
        className={cn(
          "pixel-grid fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col border-r border-white/10 bg-[#0b0812] text-white/70 transition-transform duration-300 md:static md:h-full md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/15 px-5">
          <Link
            href="/admin"
            className="text-sm font-bold uppercase tracking-[0.2em]"
          >
            <span className="italic text-[#f5e400]">{BRAND_NAME}</span>{" "}
            <span className="text-white/45">Admin</span>
          </Link>
          <button className="md:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-[#ec008c] text-white"
                  : "text-white/40 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/15 p-3">
          <div className="truncate px-3.5 pb-2 text-xs text-white/70">
            {admin.email}
          </div>
          <button
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="wave-edge z-20 flex h-16 shrink-0 items-center gap-4 bg-[#130e1e] px-5">
          <button className="md:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-bold tracking-tight">
            {title}
          </h1>
          <Link
            href="/"
            className="ml-auto text-sm font-medium text-white/40 underline-offset-4 hover:text-[#f5e400] hover:underline"
          >
            View site →
          </Link>
        </header>
        <div className="flex-1 overflow-y-auto p-5 md:p-8">{children}</div>
      </div>
    </div>
  );
}

/* ─── Small shared building blocks for the admin pages ────────────────────── */

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#130e1e] p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-white/50">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-white/40">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/15 bg-[#08060d] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#f5e400]";

export const buttonClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#f5e400] px-4 py-2.5 text-sm font-semibold text-[#08060d] transition-colors hover:bg-white disabled:opacity-50";
