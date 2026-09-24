/**
 * Carga inicial del catálogo de ACTIVE: los cuatro sabores de QUANTUM COMPLEX
 * con su COA de California.
 *
 * Es idempotente y aditivo. Un producto cuyo slug ya existe se deja tal cual, y
 * un reporte cuya URL ya está en la base no se vuelve a insertar, así que
 * correrlo contra una base que el cliente ya editó no puede deshacer su
 * trabajo. Córrelo las veces que quieras, de cualquiera de las dos formas:
 *
 *   DATABASE_URL="…" pnpm seed          (desde una máquina que alcance la BD)
 *   SEED_CATALOG=true                    (en el servidor; corre una vez al arrancar)
 *
 * Los COA se **enlazan** donde ya viven en vez de copiarse a R2: el mismo
 * archivo en dos sitios es una cosa más que mantener en sincronía cuando se
 * retestea un lote. Si más adelante quieres copias propias, `MIRROR_REPORTS`
 * las baja a R2 y reescribe los enlaces.
 */
import "dotenv/config";
import * as db from "./db";

const COLLECTION = "QUANTUM COMPLEX";
const SUBTITLE = "10 COUNT DISPLAY — 400MG PER PACK · 80MG PER TAB";
const DESCRIPTION =
  "ACTIVE Quantum Complex. 80mg por tableta, 4 porciones por tableta (20mg por porción), 10 unidades por display. Fórmula de liberación retardada. Solo para mayores de 21 años.";

type Seed = {
  slug: string;
  name: string;
  image: string;
  batch: string;
  coa: string;
};

/* Los COA viven en el propio repo, servidos por el sitio.
   Enlazarlos a un dominio ajeno los deja fuera de nuestro control: si ese sitio
   los mueve o se cae, los cuatro reportes se rompen a la vez y aquí no hay nada
   que se pueda hacer. Aquí van versionados, sin R2 de por medio y sin CORS. */
const BASE = "/lab-reports";

const LAB = "PharmLabs";
const TESTED_ON = "2026-08-13";

/**
 * La línea como producto propio.
 *
 * Los códigos de verificación se imprimen para QUANTUM COMPLEX, no para un
 * sabor: un mismo código puede acabar en cualquiera de las cuatro cajas. Como
 * un código apunta a un producto, la línea necesita existir como tal para poder
 * apuntar ahí y que el resultado de verificación diga "Quantum Complex" en vez
 * de mentir con un sabor cualquiera.
 *
 * Va sin publicar y sin reportes, así que no aparece en Lab Reports: esa página
 * solo muestra productos que tengan COA, y los COA son por sabor.
 */
const LINE_PRODUCT = {
  slug: "quantum-complex",
  name: "Quantum Complex",
  subtitle: SUBTITLE,
};

const PRODUCTS: Seed[] = [
  {
    slug: "quantum-complex-strawberry",
    name: "Strawberry",
    image: "/products/strawberry.webp",
    batch: "SD260813-078",
    coa: `${BASE}/ACTIVE-QUT-Strawberry.pdf`,
  },
  {
    slug: "quantum-complex-cherry-berry",
    name: "Cherry Berry",
    image: "/products/cherry-berry.webp",
    batch: "SD260813-079",
    coa: `${BASE}/ACTIVE-QUT-Cherry.pdf`,
  },
  {
    slug: "quantum-complex-blue-razz",
    name: "Blue Razz",
    image: "/products/blue-razz.webp",
    batch: "SD260813-080",
    coa: `${BASE}/ACTIVE-QUT-Blueberry.pdf`,
  },
  {
    slug: "quantum-complex-watermelon",
    name: "Watermelon",
    image: "/products/watermelon.webp",
    batch: "SD260813-081",
    coa: `${BASE}/ACTIVE-QUT-Watermelon.pdf`,
  },
];

export async function seedCatalog(opts: { refreshReports?: boolean } = {}): Promise<void> {
  let refreshedReports = 0;
  let createdProducts = 0;
  let createdReports = 0;

  /* La línea primero: es a donde apuntan los códigos de verificación. */
  if (!(await db.getProductBySlug(LINE_PRODUCT.slug))) {
    await db.createProduct({
      slug: LINE_PRODUCT.slug,
      name: LINE_PRODUCT.name,
      collection: COLLECTION,
      subtitle: LINE_PRODUCT.subtitle,
      description: DESCRIPTION,
      imageUrl: null,
      imageKey: null,
      sortOrder: 0,
      published: false,
    });
    createdProducts++;
    console.log(`+ product  ${LINE_PRODUCT.name} (línea; destino de los códigos)`);
  } else {
    console.log(`= product  ${LINE_PRODUCT.name} (already present, left alone)`);
  }

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
        sortOrder: index + 1,
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
    if (existing.some(r => r.fileUrl === seed.coa)) {
      console.log(`= report   ${seed.batch} (already present)`);
      continue;
    }

    /* Modo refresco: en vez de agregar un reporte más, se reapunta el que ya
       hay. Es lo que hace falta cuando el laboratorio manda una versión nueva
       del mismo COA — crear otro dejaría los dos publicados y el cliente
       viendo dos enlaces para el mismo lote, sin saber cuál es el bueno.
       Va detrás de una opción y no por defecto porque pisa lo que el panel
       tenga guardado para esos cuatro productos. */
    if (opts.refreshReports && existing.length > 0) {
      const target = existing[0];
      await db.updateLabReport(target.id, {
        title: `California COA — Batch ${seed.batch}`,
        batch: seed.batch,
        lab: LAB,
        testedOn: TESTED_ON,
        fileUrl: seed.coa,
        fileKey: "",
        fileName: seed.coa.split("/").pop() ?? null,
        sizeBytes: null,
        published: true,
      });
      refreshedReports++;
      console.log(`~ report   ${seed.batch} → ${seed.coa}`);
      continue;
    }

    await db.createLabReport({
      productId: product.id,
      title: `California COA — Batch ${seed.batch}`,
      batch: seed.batch,
      lab: LAB,
      testedOn: TESTED_ON,
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
    `[Seed] Done. ${createdProducts} product(s) and ${createdReports} report(s) added` +
      `${refreshedReports ? `, ${refreshedReports} report(s) refreshed` : ""}.`
  );
}

/**
 * Boot hook. `SEED_CATALOG=true` carga lo que falte; `SEED_CATALOG=refresh`
 * además reapunta los reportes de estos cuatro productos a los COA de este
 * archivo, para cuando el laboratorio manda una versión nueva.
 *
 * Gated on SEED_CATALOG so a redeploy doesn't silently re-run it
 * every time the container restarts; set the variable, wait for the deploy,
 * then remove it. A failure is logged and swallowed — the catalogue is content,
 * and the site should still come up and verify codes without it.
 */
export async function seedCatalogIfRequested(): Promise<void> {
  const mode = process.env.SEED_CATALOG;
  if (mode !== "true" && mode !== "refresh") return;
  try {
    console.log("[Seed] SEED_CATALOG is set — loading the ACTIVE catalogue…");
    await seedCatalog({ refreshReports: mode === "refresh" });
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
  seedCatalog({ refreshReports: process.argv.includes("--refresh") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
