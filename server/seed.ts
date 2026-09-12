/**
 * Carga inicial del catálogo de ACTIVE.
 *
 * La lista está vacía a propósito: el catálogo de ACTIVE (productos, lotes y
 * COA) se administra desde el panel, que es donde el cliente lo mantiene. Este
 * archivo existe para cargas masivas puntuales — llenar PRODUCTS, correrlo, y
 * volver a vaciarlo.
 *
 * Es idempotente y aditivo. Un producto cuyo slug ya existe se deja tal cual, y
 * un reporte cuya URL ya está en la base no se vuelve a insertar, así que
 * correrlo contra una base que el cliente ya editó no puede deshacer su
 * trabajo:
 *
 *   DATABASE_URL="…" pnpm seed          (desde una máquina que alcance la BD)
 *   SEED_CATALOG=true                    (en el servidor; corre una vez al arrancar)
 */
import "dotenv/config";
import * as db from "./db";

const COLLECTION = "QUANTUM COMPLEX";
const SUBTITLE = "10 COUNT DISPLAY — 80MG PER TAB";
const DESCRIPTION = "";

type Seed = {
  slug: string;
  name: string;
  image: string;
  batch: string;
  coa: string;
};

const PRODUCTS: Seed[] = [];

export async function seedCatalog(): Promise<void> {
  let createdProducts = 0;
  let createdReports = 0;

  for (let index = 0; index < PRODUCTS.length; index++) {
    const seed = PRODUCTS[index];
    let product = await db.getProductBySlug(seed.slug);

    if (!product) {
      await db.createProduct({
        slug: seed.slug,
        name: seed.name,
        collection: COLLECTION,
        subtitle: SUBTITLE,
        description: DESCRIPTION,
        imageUrl: seed.image,
        imageKey: null,
        sortOrder: index,
        published: true,
      });
      product = await db.getProductBySlug(seed.slug);
      createdProducts++;
      console.log(`+ product  ${seed.name}`);
    } else {
      console.log(`= product  ${seed.name} (already present, left alone)`);
    }

    if (!product) {
      console.error(`  could not read back ${seed.slug}, skipping its report`);
      continue;
    }

    const existing = await db.listLabReports(product.id);
    if (existing.some((r) => r.fileUrl === seed.coa)) {
      console.log(`= report   ${seed.batch} (already present)`);
      continue;
    }

    await db.createLabReport({
      productId: product.id,
      title: `California COA — Batch ${seed.batch}`,
      batch: seed.batch,
      lab: null,
      testedOn: null,
      fileUrl: seed.coa,
      fileKey: "",
      fileName: seed.coa.split("/").pop() ?? null,
      sizeBytes: null,
      sortOrder: 0,
      published: true,
    });
    createdReports++;
    console.log(`+ report   ${seed.batch}`);
  }

  console.log(
    `[Seed] Done. ${createdProducts} product(s) and ${createdReports} report(s) added.`
  );
}

/**
 * Boot hook. Gated on SEED_CATALOG so a redeploy doesn't silently re-run it
 * every time the container restarts; set the variable, wait for the deploy,
 * then remove it. A failure is logged and swallowed — the catalogue is content,
 * and the site should still come up and verify codes without it.
 */
export async function seedCatalogIfRequested(): Promise<void> {
  if (process.env.SEED_CATALOG !== "true") return;
  try {
    console.log("[Seed] SEED_CATALOG is set — loading the ACTIVE catalogue…");
    await seedCatalog();
  } catch (err) {
    console.error("[Seed] FAILED — the site will start without it:", err);
  }
}

/** CLI entry point: `pnpm seed`. */
const isCli = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isCli) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  seedCatalog()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
