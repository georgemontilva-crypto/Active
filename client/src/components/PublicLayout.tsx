import { BRAND_NAME } from "@shared/const";
import { Link, useLocation } from "wouter";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const onVerify = location.startsWith("/verify");

  return (
    <div className="flex min-h-screen flex-col bg-[#08060d] text-white">
      {/* Franja superior: el mosaico de píxeles del empaque, en su versión más
          saturada. Es la única superficie magenta a sangre del sitio, así que
          marca dónde empieza la página sin necesidad de un borde. */}
      <div className="pixel-mosaic text-center">
        <Link
          href="/"
          className="block px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.12em] text-[#f5e400] transition-opacity hover:opacity-80"
        >
          See all lab reports here
        </Link>
      </div>

      <header className="wave-edge relative overflow-hidden bg-[#08060d]">
        <div className="pixel-grid absolute inset-0 opacity-70" aria-hidden />
        {/* El halo queda detrás del logotipo y se sale por arriba: el corte
            superior es lo que lo hace leer como luz y no como un círculo. */}
        <div
          className="magenta-glow pointer-events-none absolute left-1/2 top-0 h-[320px] w-[min(520px,130vw)] -translate-x-1/2 -translate-y-1/3"
          aria-hidden
        />
        <div className="container relative flex h-28 items-center justify-center sm:h-32">
          <Link href="/" aria-label={`${BRAND_NAME} home`}>
            <Wordmark className="h-16 sm:h-20" />
          </Link>
        </div>
      </header>

      <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0812]/95 backdrop-blur-md">
        <div className="container flex items-center justify-center gap-2 py-1">
          <NavLink href="/" active={!onVerify}>
            Lab Reports
          </NavLink>
          <NavLink href="/verify" active={onVerify}>
            Verify Your Code
          </NavLink>
        </div>
      </nav>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "border-b-[3px] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.1em] transition-colors sm:text-sm",
        active
          ? "border-[#f5e400] text-[#f5e400]"
          : "border-transparent text-white/45 hover:text-white",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

/**
 * El logotipo de la marca.
 *
 * El archivo es el original de ACTIVE: la palabra dibujada como forma de onda,
 * en amarillo sobre fondo transparente. Se sirve tal cual, sin recolorear ni
 * agregarle sombra, porque el trazo ya es la identidad.
 *
 * El width/height van declarados para que el navegador reserve el espacio antes
 * de que la imagen cargue; sin ellos el header salta de alto cuando entra.
 */
function Wordmark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/logo.png"
      alt={BRAND_NAME}
      width={685}
      height={243}
      className={`w-auto ${className}`}
    />
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16">
      <div className="wave-edge-top relative overflow-hidden bg-[#08060d] px-5 pb-10 pt-14 text-center">
        <div className="pixel-grid absolute inset-0 opacity-60" aria-hidden />
        <div
          className="magenta-glow pointer-events-none absolute bottom-0 left-1/2 h-[260px] w-[min(520px,130vw)] -translate-x-1/2 translate-y-1/2"
          aria-hidden
        />

        <div className="relative">
          <Wordmark className="mx-auto h-12" />

          <div className="mx-auto mt-10 max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#f5e400]">
              FDA Disclaimer
            </p>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-white/65">
              This product has not been evaluated by the Food and Drug
              Administration. These statements have not been evaluated by the FDA.
              This product is not intended to diagnose, treat, cure, or prevent any
              disease or illness. Keep out of reach of children. For adults 21 and
              over only.
            </p>
            <hr className="mx-auto mt-10 max-w-4xl border-white/15" />
          </div>
        </div>
      </div>

      <div className="pixel-mosaic px-5 py-3.5 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.08em] text-[#f5e400]">
          Copyright &copy; {new Date().getFullYear()} &ndash; {BRAND_NAME} All Rights
          Reserved
        </p>
      </div>
    </footer>
  );
}
