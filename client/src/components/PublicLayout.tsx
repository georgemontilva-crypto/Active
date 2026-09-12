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
          className="magenta-glow pointer-events-none absolute left-1/2 top-0 h-[320px] w-[520px] -translate-x-1/2 -translate-y-1/3"
          aria-hidden
        />
        <div className="container relative flex h-28 items-center justify-center sm:h-32">
          <Link href="/" aria-label={`${BRAND_NAME} home`}>
            <Wordmark className="h-14 sm:h-16" />
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
 * El logotipo como SVG y no como PNG.
 *
 * La marca es una palabra sobre una onda, y ambas cosas son vectoriales: en
 * SVG se mantiene nítida a cualquier tamaño, pesa unos cientos de bytes y el
 * amarillo puede cambiar por CSS si una sección lo necesita. Un PNG con el
 * texto rasterizado obligaría a servir tres tamaños y se vería borroso en el
 * pie, que es donde se usa más pequeño.
 *
 * La onda cruza por detrás de las letras, no por debajo: es lo que hace que la
 * palabra se lea como una señal y no como un texto con un adorno al pie.
 */
function Wordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 620 150"
      role="img"
      aria-label={BRAND_NAME}
      className={`w-auto ${className}`}
    >
      <title>{BRAND_NAME}</title>

      {/* Onda de fondo. Los picos altos caen entre letras para que ninguno
          quede tapado por un asta vertical. */}
      <polyline
        points="10,80 70,80 92,34 112,122 134,58 152,96 176,80 250,80 268,20 288,136 308,52 328,104 348,80 430,80 452,40 470,118 492,62 512,92 536,80 610,80"
        fill="none"
        stroke="#ec008c"
        strokeWidth="7"
        strokeLinecap="square"
        strokeLinejoin="miter"
        opacity="0.95"
      />

      {/* Trazo negro por debajo del texto: separa las letras de la onda sin
          tener que abrir un hueco en la propia onda. */}
      <text
        x="310"
        y="104"
        textAnchor="middle"
        fontFamily="'Chakra Petch', system-ui, sans-serif"
        fontSize="96"
        fontWeight="700"
        fontStyle="italic"
        letterSpacing="6"
        stroke="#08060d"
        strokeWidth="14"
        paintOrder="stroke"
        fill="#f5e400"
      >
        ACTIVE
      </text>
    </svg>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16">
      <div className="wave-edge-top relative overflow-hidden bg-[#08060d] px-5 pb-10 pt-14 text-center">
        <div className="pixel-grid absolute inset-0 opacity-60" aria-hidden />
        <div
          className="magenta-glow pointer-events-none absolute bottom-0 left-1/2 h-[260px] w-[520px] -translate-x-1/2 translate-y-1/2"
          aria-hidden
        />

        <div className="relative">
          <Wordmark className="mx-auto h-10" />

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
