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
import { isStorageConfigured, missingStorageVars, publicUrlFor } from "./storage";

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

  let fixed = 0;
  let ok = 0;
  let external = 0;

  for (const report of await db.listLabReports()) {
    if (!report.fileKey) {
      external++;
      continue;
    }
    const expected = publicUrlFor(report.fileKey);
    if (expected === report.fileUrl) {
      ok++;
      continue;
    }
    console.log(`report ${report.id}: ${report.fileUrl}\n         → ${expected}`);
    if (!dryRun) await db.updateLabReport(report.id, { fileUrl: expected });
    fixed++;
  }

  for (const product of await db.listProducts()) {
    if (!product.imageKey) continue;
    const expected = publicUrlFor(product.imageKey);
    if (expected === product.imageUrl) {
      ok++;
      continue;
    }
    console.log(`product ${product.id}: ${product.imageUrl}\n          → ${expected}`);
    if (!dryRun) await db.updateProduct(product.id, { imageUrl: expected });
    fixed++;
  }

  console.log("");
  console.log(`Corregidas: ${fixed}${dryRun ? " (dry-run: no se escribió nada)" : ""}`);
  console.log(`Ya estaban bien: ${ok}`);
  if (external) console.log(`Enlazadas a un sitio externo, intactas: ${external}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Falló:", err);
    process.exit(1);
  });
