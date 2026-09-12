import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * Guards admin pages using the proprietary admin session (not Manus OAuth).
 * Redirects to /admin/login when no valid admin session exists.
 */
export function useAdminGuard() {
  const [, navigate] = useLocation();
  const me = trpc.adminAuth.me.useQuery(undefined, { retry: false });

  useEffect(() => {
    if (me.isError) {
      navigate("/admin/login");
    }
  }, [me.isError, navigate]);

  return { admin: me.data, isLoading: me.isLoading, isError: me.isError };
}
