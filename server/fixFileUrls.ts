/**
 * Reconstruye las URLs públicas de los archivos que subimos nosotros.
 *
 * La URL completa se guarda en la base cuando se sube el archivo, así que si
 * `R2_PUBLIC_URL` estaba mal en ese momento, corregir la variable no arregla lo
 * ya guardado: las filas siguen apuntando al enlace roto. Esto las reescribe a
 * partir de la clave del objeto, que sí es correcta.
 *
 *   DATABASE_URL="…" R2_PUBLIC_URL="…" pnpm fix-urls [--dry-run]
 *
 * Solo toca filas con clave propia (`fileKey` / `imageKey`). Un reporte
 * enlazado a un sitio externo no tiene clave y se deja intacto: su URL no es
 * nuestra y reescribirla la rompería.
 */
import "dotenv/config";
import * as db from "./db";
import {
  isStorageConfigured,
  missingStorageVars,
  publicUrlFor,
} from "./storage";

export type UrlRepairResult = {
  fixed: number;
  alreadyOk: number;
  external: number;
  changes: {
    kind: "report" | "product";
    id: number;
    from: string | null;
    to: string;
  }[];
};

/**
 * Recalcula la URL pública de cada archivo propio a partir de su clave.
 *
 * Lo usa tanto el script de consola como el botón del panel, para que no haya
 * dos versiones de la misma reparación que puedan divergir.
 */
export async function repairFileUrls(dryRun = false): Promise<UrlRepairResult> {
  const result: UrlRepairResult = {
    fixed: 0,
    alreadyOk: 0,
    external: 0,
    changes: [],
  };

  for (const report of await db.listLabReports()) {
    if (!report.fileKey) {
      result.external++;
      continue;
    }
    const expected = publicUrlFor(report.fileKey);
    if (expected === report.fileUrl) {
      result.alreadyOk++;
      continue;
    }
    result.changes.push({
      kind: "report",
      id: report.id,
      from: report.fileUrl,
      to: expected,
    });
    if (!dryRun) await db.updateLabReport(report.id, { fileUrl: expected });
    result.fixed++;
  }

  for (const product of await db.listProducts()) {
    if (!product.imageKey) continue;
    const expected = publicUrlFor(product.imageKey);
    if (expected === product.imageUrl) {
      result.alreadyOk++;
      continue;
    }
    result.changes.push({
      kind: "product",
      id: product.id,
      from: product.imageUrl,
      to: expected,
    });
    if (!dryRun) await db.updateProduct(product.id, { imageUrl: expected });
    result.fixed++;
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }
  if (!isStorageConfigured()) {
    console.error(`Falta configurar R2: ${missingStorageVars().join(", ")}`);
    process.exit(1);
  }

  const result = await repairFileUrls(dryRun);
  for (const change of result.changes) {
    console.log(
      `${change.kind} ${change.id}: ${change.from}\n         → ${change.to}`
    );
  }

  console.log("");
  console.log(
    `Corregidas: ${result.fixed}${dryRun ? " (dry-run: no se escribió nada)" : ""}`
  );
  console.log(`Ya estaban bien: ${result.alreadyOk}`);
  if (result.external) {
    console.log(`Enlazadas a un sitio externo, intactas: ${result.external}`);
  }
}

/* Solo como CLI. Sin esta guarda, importar el módulo desde el router
   ejecutaría main() al arrancar el servidor y lo mataría con process.exit. */
const isCli =
  process.argv[1]?.endsWith("fixFileUrls.ts") ||
  process.argv[1]?.endsWith("fixFileUrls.js");

if (isCli) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Falló:", err);
      process.exit(1);
    });
}
