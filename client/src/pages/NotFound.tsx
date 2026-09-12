import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#08060d] px-4 text-white">
      <div className="pixel-grid absolute inset-0 opacity-60" aria-hidden />
      <div
        className="magenta-glow pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[min(520px,130vw)] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      />

      <div className="clip-notch relative w-full max-w-lg border border-white/10 bg-[#130e1e] p-10 text-center">
        <AlertCircle className="mx-auto h-14 w-14 text-[#ec008c]" />

        <h1 className="mt-6 font-display text-5xl font-bold italic tracking-tight">404</h1>
        <h2 className="mt-2 font-display text-xl font-bold uppercase tracking-[0.12em] text-white/70">
          Page Not Found
        </h2>

        <p className="mt-4 text-sm leading-relaxed text-white/50">
          Sorry, the page you are looking for doesn&apos;t exist. It may have been
          moved or deleted.
        </p>

        <button
          onClick={() => setLocation("/")}
          className="press mt-8 inline-flex items-center justify-center gap-2 bg-[#f5e400] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-[#08060d] transition-colors hover:bg-white"
        >
          <Home className="h-4 w-4" />
          Go Home
        </button>
      </div>
    </div>
  );
}
