import { Toaster } from "sonner";

import { useEffect, useLayoutEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";

import LabReports from "@/pages/LabReports";
import NotFound from "@/pages/NotFound";
import Verify from "@/pages/Verify";

import AdminCodes from "@/pages/admin/AdminCodes";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminLabReports from "@/pages/admin/AdminLabReports";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminLogs from "@/pages/admin/AdminLogs";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminUsers from "@/pages/admin/AdminUsers";

/**
 * Browsers default scrollRestoration to "auto" and restore the previous offset
 * after React has mounted, which overwrites anything an effect does on the way
 * in. Switching it to manual and re-asserting the top on route change keeps a
 * result page from opening halfway down.
 */
function ScrollToTop() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

/**
 * The root is the lab reports page.
 *
 * It still answers `/?code=…` by handing off to the verification page, because
 * codes printed on packaging outlive the site's routing: a QR pointing at the
 * old root would otherwise drop the customer on a list of PDFs with their code
 * silently discarded. The redirect carries the code across and replaces the
 * history entry, so Back returns to wherever they came from rather than
 * bouncing through here again.
 */
function Home() {
  const [, navigate] = useLocation();
  const code =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("code");

  useEffect(() => {
    if (code)
      navigate(`/verify?code=${encodeURIComponent(code)}`, { replace: true });
  }, [code, navigate]);

  return code ? null : <LabReports />;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      {/* Sin esto no se ve ni un aviso en toda la app.
          Todo el panel reporta con toast.success / toast.error, pero sonner
          solo pinta donde esté montado su contenedor, y no estaba en ninguna
          parte: guardar, fallar al guardar y no hacer nada se veían igual.
          Va aquí arriba para que valga tanto para el panel como para el sitio. */}
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          style: {
            background: "#130e1e",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#f4f2f8",
          },
        }}
      />
      <Switch>
        {/* Public */}
        <Route path="/" component={Home} />
        <Route path="/verify" component={Verify} />
        {/* Lab reports moved to the root; kept so older links still land. */}
        <Route path="/lab-reports">
          <Redirect to="/" replace />
        </Route>

        {/* Admin */}
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/codes" component={AdminCodes} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/lab-reports" component={AdminLabReports} />
        <Route path="/admin/logs" component={AdminLogs} />
        <Route path="/admin/users" component={AdminUsers} />

        <Route component={NotFound} />
      </Switch>
    </>
  );
}
