import { PublicLayout } from "@/components/PublicLayout";
import { trpc } from "@/lib/trpc";
import { BRAND_NAME, SUPPORT_EMAIL } from "@shared/const";
import { AlertTriangle, ArrowUpRight, Check, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";

type VerifyResult = {
  valid: boolean;
  code: string;
  product?: { name: string; subtitle: string | null; imageUrl: string | null } | null;
  batch?: string | null;
  verificationCount?: number;
  maxVerifications?: number;
  previouslyVerified?: boolean;
  firstVerifiedAt?: Date | null;
  collection?: string | null;
  reports?: { id: number; productName: string; batch: string | null; fileUrl: string }[];
};

export default function Verify() {
  // Prefilled from ?code= so a QR on the package can land straight on the result
  // without the customer retyping what the sticker already told the phone.
  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("code") ?? "";
  });
  const [result, setResult] = useState<VerifyResult | null>(null);

  const verify = trpc.codes.verify.useMutation({
    onSuccess: (data) => setResult(data as VerifyResult),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setResult(null);
    verify.mutate({ code: trimmed });
  };

  const reset = () => {
    setResult(null);
    setCode("");
    verify.reset();
  };

  return (
    <PublicLayout>
      <div className="relative overflow-hidden">
        <div className="pixel-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div
          className="magenta-glow pointer-events-none absolute left-1/2 top-0 h-[420px] w-[min(620px,140vw)] -translate-x-1/2 opacity-70"
          aria-hidden
        />

        <div className="container relative max-w-xl py-14">
          {result ? (
            result.valid ? (
              <AuthenticResult result={result} onReset={reset} />
            ) : (
              <InvalidResult result={result} onReset={reset} />
            )
          ) : (
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#ec008c]">
                {BRAND_NAME} security check
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold uppercase italic tracking-tight sm:text-4xl">
                Product Authentication
              </h1>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-white/55">
                Scratch the security label on your {BRAND_NAME} product and enter the
                code below exactly as it appears.
              </p>

              <form
                onSubmit={onSubmit}
                className="clip-notch mt-9 border border-white/10 bg-[#130e1e] p-6 text-left sm:p-7"
              >
                <label
                  htmlFor="code"
                  className="block text-xs font-bold uppercase tracking-[0.18em] text-white/45"
                >
                  Verification code
                </label>
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ABCD12345"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="mt-2.5 w-full border-2 border-white/15 bg-[#08060d] px-4 py-4 text-center font-mono text-lg uppercase tracking-[0.2em] text-white outline-none transition placeholder:tracking-normal placeholder:text-white/20 focus:border-[#f5e400]"
                />
                <button
                  type="submit"
                  disabled={verify.isPending || !code.trim()}
                  className="press mt-3 inline-flex w-full items-center justify-center gap-2 bg-[#f5e400] px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-[#08060d] transition-colors hover:bg-white disabled:opacity-40"
                >
                  {verify.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking
                    </>
                  ) : (
                    "Verify"
                  )}
                </button>

                {verify.isError && (
                  <p className="mt-3 text-sm text-[#ff8080]">
                    Something went wrong. Please try again in a moment.
                  </p>
                )}
              </form>

              <p className="mt-6 text-xs leading-relaxed text-white/45">
                Each code can be checked a limited number of times. If yours has
                already been used up, contact{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[#f5e400] underline underline-offset-2"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

function AuthenticResult({ result, onReset }: { result: VerifyResult; onReset: () => void }) {
  const used = result.verificationCount ?? 1;
  const max = result.maxVerifications ?? 3;
  const remaining = Math.max(0, max - used);

  return (
    <div className="text-center">
      {result.product?.imageUrl && (
        <img
          src={result.product.imageUrl}
          alt={result.product.name}
          className="mx-auto mb-7 h-28 w-auto object-contain"
        />
      )}

      {/* El verde se queda. La marca es magenta y amarilla, pero "auténtico" se
          lee en verde en todas partes, y un tilde magenta obligaría al visitante
          a leer el texto para saber si pasó o falló. */}
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#123322] ring-1 ring-[#2ee27a]/40">
        <Check className="h-10 w-10 text-[#2ee27a]" strokeWidth={3} />
      </div>

      <h1 className="mt-6 font-display text-3xl font-bold uppercase italic tracking-tight sm:text-4xl">
        This Product Is Authentic
      </h1>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">
        This product has been successfully authenticated by {BRAND_NAME}.
      </p>

      <dl className="clip-notch mt-8 divide-y divide-white/10 border border-white/10 bg-[#130e1e] px-5 text-sm">
        {result.product && (
          <Row label="Product">
            {result.product.name}
            {result.product.subtitle ? ` — ${result.product.subtitle}` : ""}
          </Row>
        )}
        <Row label="Code">
          <span className="font-mono tracking-widest text-[#f5e400]">{result.code}</span>
        </Row>
        {result.batch && <Row label="Batch">{result.batch}</Row>}
        <Row label="Status">Authentic</Row>
      </dl>

      {/* Shown from the second check onward. A genuine buyer checking their own
          purchase sees this once, at most; a shopper seeing it on a sealed unit
          in a shop is looking at a label someone has already scanned. */}
      {result.previouslyVerified && (
        <div className="mt-4 border-l-4 border-[#f5e400] bg-[#1b1428] px-5 py-4 text-left text-sm">
          <p className="font-bold uppercase tracking-[0.12em] text-[#f5e400]">
            Previously verified
          </p>
          <p className="mt-1.5 text-white/70">
            This code has been verified before. Verification count:{" "}
            <strong className="text-white">{used}</strong> of {max}
          </p>
          {result.firstVerifiedAt && (
            <p className="mt-1 text-xs text-white/45">
              First checked {new Date(result.firstVerifiedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Los COA de la línea, aquí mismo.
          El código es de QUANTUM COMPLEX y puede venir en cualquiera de los
          cuatro sabores, así que mandarlo a buscar su reporte al menú es un
          paso de más justo cuando acaba de confirmar que la caja es legítima. */}
      {result.reports && result.reports.length > 0 && (
        <div className="clip-notch mt-6 border border-white/10 bg-[#130e1e] p-5 text-left">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
            Lab reports{result.collection ? ` — ${result.collection}` : ""}
          </p>
          <ul className="mt-3 space-y-2">
            {result.reports.map((r) => (
              <li key={r.id}>
                <a
                  href={r.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-[#f5e400] underline-offset-4 decoration-2 hover:underline"
                >
                  {r.productName}
                  {r.batch ? ` · ${r.batch}` : ""}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-white/45">
        {remaining > 0
          ? `${remaining} check${remaining === 1 ? "" : "s"} remaining on this code.`
          : "This was the last check available on this code."}
      </p>

      <button
        onClick={onReset}
        className="mt-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#f5e400] underline underline-offset-4 decoration-2 hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Verify another product
      </button>
    </div>
  );
}

/**
 * One screen for every failure.
 *
 * It deliberately doesn't say which kind of failure it was. A code that is out
 * of checks and a code that never existed look identical here, so someone
 * feeding in copied labels learns nothing about which of them came off a real
 * package. The retry steps come first because a mistyped character is by far
 * the most common reason a real customer lands on this screen.
 */
function InvalidResult({ result, onReset }: { result: VerifyResult; onReset: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#3a1016] ring-1 ring-[#ff3b46]/40">
        <AlertTriangle className="h-9 w-9 text-[#ff5c66]" strokeWidth={2.5} />
      </div>

      <h1 className="mt-6 font-display text-3xl font-bold uppercase italic tracking-tight sm:text-4xl">
        Code Not Valid
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/55">
        We couldn&apos;t verify{" "}
        <span className="font-mono font-semibold tracking-widest text-white">{result.code}</span>.
        Before assuming the worst, try this:
      </p>

      <ol className="clip-notch mx-auto mt-6 max-w-sm space-y-3 border border-white/10 bg-[#130e1e] p-5 text-left text-sm text-white/70">
        <li className="flex gap-3">
          <span className="font-bold text-[#ec008c]">1.</span>
          Check the code character by character. Zero and the letter O are easy to
          confuse, as are one and the letter I.
        </li>
        <li className="flex gap-3">
          <span className="font-bold text-[#ec008c]">2.</span>
          Make sure the whole label is scratched off, so no character is hidden.
        </li>
        <li className="flex gap-3">
          <span className="font-bold text-[#ec008c]">3.</span>
          If it still doesn&apos;t work, send us a photo of the label and of the
          product and we&apos;ll look into it.
        </li>
      </ol>

      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          `Code verification: ${result.code}`
        )}`}
        className="press mt-6 inline-flex items-center justify-center bg-[#f5e400] px-7 py-3.5 text-sm font-bold uppercase tracking-[0.12em] text-[#08060d] transition-colors hover:bg-white"
      >
        Contact us about this code
      </a>

      <p className="mx-auto mt-5 max-w-sm text-xs leading-relaxed text-white/45">
        If you bought this product from an unauthorised seller, it may be
        counterfeit. Genuine {BRAND_NAME} products are only sold through approved
        retailers.
      </p>

      <button
        onClick={onReset}
        className="mt-7 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#f5e400] underline underline-offset-4 decoration-2 hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Verify another product
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3.5 text-left">
      <dt className="shrink-0 text-white/45">{label}</dt>
      <dd className="text-right font-medium text-white">{children}</dd>
    </div>
  );
}
