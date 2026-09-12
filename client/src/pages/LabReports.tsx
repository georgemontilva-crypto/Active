import { PublicLayout } from "@/components/PublicLayout";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, FileText, Loader2 } from "lucide-react";

type Report = {
  id: number;
  title: string;
  batch: string | null;
  lab: string | null;
  testedOn: string | null;
  fileUrl: string;
  fileName: string | null;
  sizeBytes: number | null;
};

type Product = {
  id: number;
  name: string;
  collection: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  reports: Report[];
};

export default function LabReports() {
  const { data, isLoading } = trpc.catalog.publicReports.useQuery();
  const products = (data ?? []).filter((p) => p.reports.length > 0) as Product[];

  // Group into product lines, preserving the order the server sorted them in so
  // sortOrder in the admin panel controls the page.
  const groups: { name: string; items: Product[] }[] = [];
  for (const product of products) {
    const key = product.collection?.trim() || "Other products";
    const existing = groups.find((g) => g.name === key);
    if (existing) existing.items.push(product);
    else groups.push({ name: key, items: [product] });
  }

  return (
    <PublicLayout>
      <div className="relative overflow-hidden">
        <div className="pixel-scatter pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="container relative py-12">
          <header className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#ec008c]">
              Certificates of analysis
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold uppercase italic tracking-tight sm:text-4xl">
              Lab Reports
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Every batch is tested by a third-party laboratory. Open the report
              for the product you have in your hands.
            </p>
          </header>

          {isLoading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-[#ec008c]" />
            </div>
          ) : groups.length === 0 ? (
            <div className="clip-notch mx-auto mt-14 max-w-md border border-white/10 bg-[#130e1e] p-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-white/20" />
              <p className="mt-4 text-sm text-white/50">
                No lab reports have been published yet. Check back soon.
              </p>
            </div>
          ) : (
            <div className="mt-12 space-y-14">
              {groups.map((group) => (
                <section key={group.name}>
                  <div className="flex items-center gap-3">
                    {/* Bloque de píxel antes del título: el mismo recurso de las
                        viñetas del empaque, y sirve de ancla visual para saber
                        dónde empieza cada línea de producto. */}
                    <span className="h-5 w-1.5 bg-[#ec008c]" aria-hidden />
                    <h2 className="font-display text-2xl font-bold uppercase italic tracking-tight sm:text-3xl">
                      {group.name}
                    </h2>
                  </div>
                  <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

function ProductCard({ product }: { product: Product }) {
  // One report is the common case and gets a single plain link, matching the
  // rest of the card. Several need to be told apart, so they become a list
  // labelled by batch.
  const single = product.reports.length === 1 ? product.reports[0] : null;

  return (
    <article className="clip-notch group relative flex gap-5 border border-white/10 bg-[#130e1e] p-6 transition-colors hover:border-[#ec008c]/60">
      <div className="pixel-grid relative flex h-28 w-28 shrink-0 items-center justify-center bg-[#1b1428]">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <FileText className="h-7 w-7 text-white/20" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-bold uppercase italic tracking-tight">
          {product.name}
        </h3>
        {product.subtitle && (
          <p className="mt-1.5 text-sm leading-snug text-white/45">{product.subtitle}</p>
        )}

        {single ? (
          <a
            href={single.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-[#f5e400] underline-offset-4 decoration-2 hover:underline"
          >
            See lab report
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : (
          <ul className="mt-4 space-y-2">
            {product.reports.map((r) => (
              <li key={r.id}>
                <a
                  href={r.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-[#f5e400] underline-offset-4 decoration-2 hover:underline"
                >
                  {r.batch ? `Batch ${r.batch}` : r.title}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
