/**
 * Importa códigos de verificación desde un archivo, en volumen.
 *
 * El panel también importa, pero manda el archivo entero en una sola petición
 * HTTP y lo procesa en memoria: sirve para unos miles de códigos, no para
 * cientos de miles. Este script lee el archivo por líneas e inserta por
 * bloques, así que el consumo de memoria no depende del tamaño del archivo.
 *
 *   DATABASE_URL="…" pnpm import-codes archivo.txt --product=<slug> --batch=<lote>
 *
 * Opciones:
 *   --product=<slug>   producto al que apuntan los códigos. `--product=none`
 *                      los deja sin producto (se verifican igual, pero el
 *                      resultado no muestra nombre ni imagen).
 *   --batch=<texto>    lote impreso en el empaque. Opcional.
 *   --max=<n>          consultas permitidas por código. Por defecto 3.
 *   --dry-run          solo analiza el archivo: no toca la base de datos.
 *
 * Es aditivo: un código que ya existe se deja intacto, no se reinicia su
 * contador. Reimportar el archivo para agregar los que faltaban no le devuelve
 * consultas frescas a los que ya están en la calle.
 */
import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline";
import { authCodes } from "../drizzle/schema";
import * as db from "./db";
import { getDb } from "./db";
import { DEFAULT_MAX_VERIFICATIONS } from "../shared/const";

const CHUNK = 1000;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function parseLine(line: string): string[] {
  return line
    .split(/[,;\t]+/)
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter(
      (t) => t.length > 0 && !/^(id|code|codes|created|updated|product|batch)$/i.test(t)
    );
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("Uso: pnpm import-codes <archivo> [--product=slug] [--batch=lote] [--max=3] [--dry-run]");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`No existe el archivo: ${file}`);
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const batch = arg("batch") ?? null;
  const max = Number(arg("max") ?? DEFAULT_MAX_VERIFICATIONS);
  const productArg = arg("product");

  if (!Number.isInteger(max) || max < 1 || max > 100) {
    console.error(`--max debe ser un entero entre 1 y 100 (recibí "${arg("max")}")`);
    process.exit(1);
  }

  if (!dryRun && !process.env.DATABASE_URL) {
    console.error("DATABASE_URL no está definida.");
    process.exit(1);
  }

  /* ─── Producto ─────────────────────────────────────────────────────────── */

  let productId: number | null = null;
  if (!dryRun && productArg && productArg !== "none") {
    const product = await db.getProductBySlug(productArg);
    if (!product) {
      const all = await db.listProducts();
      console.error(`No encontré el producto "${productArg}". Disponibles:`);
      for (const p of all) console.error(`  ${p.slug}  (${p.name})`);
      process.exit(1);
    }
    productId = product.id;
    console.log(`Producto: ${product.name} (id ${product.id})`);
  } else if (productArg === "none" || !productArg) {
    console.log("Producto: ninguno (los códigos no mostrarán nombre al verificarse)");
  }
  console.log(`Lote: ${batch ?? "(ninguno)"} · consultas por código: ${max}`);

  /* ─── Lectura e inserción ──────────────────────────────────────────────── */

  const seen = new Set<string>();
  let duplicatesInFile = 0;
  let inserted = 0;
  let skipped = 0;
  let buffer: string[] = [];

  // .ignore() deja que MySQL descarte los códigos que ya existen contra el
  // índice único, en vez de consultarlos antes: con 310.000 códigos, ese
  // SELECT previo son cientos de viajes de ida y vuelta que no hacen falta.
  const flush = async () => {
    if (buffer.length === 0) return;
    if (!dryRun) {
      const conn = await getDb();
      if (!conn) throw new Error("Sin conexión a la base de datos");
      const rows = buffer.map((code) => ({
        code,
        productId,
        batch,
        maxVerifications: max,
      }));
      // mysql2 devuelve [ResultSetHeader, fields]; drizzle lo pasa tal cual, y
      // affectedRows con .ignore() cuenta solo las filas que de verdad entraron.
      const result = (await conn.insert(authCodes).ignore().values(rows)) as unknown as [
        { affectedRows?: number },
        unknown,
      ];
      const affected = result?.[0]?.affectedRows;
      const added = typeof affected === "number" ? affected : buffer.length;
      inserted += added;
      skipped += buffer.length - added;
    }
    buffer = [];
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    for (const code of parseLine(line)) {
      if (code.length > 128) {
        console.warn(`  línea ${lineNo}: código demasiado largo, lo salto`);
        continue;
      }
      if (seen.has(code)) {
        duplicatesInFile++;
        continue;
      }
      seen.add(code);
      buffer.push(code);
      if (buffer.length >= CHUNK) {
        await flush();
        if (seen.size % 50_000 === 0) console.log(`  ${seen.size.toLocaleString()} códigos procesados…`);
      }
    }
  }
  await flush();

  console.log("");
  console.log(`Códigos únicos en el archivo: ${seen.size.toLocaleString()}`);
  if (duplicatesInFile) {
    console.log(`Repetidos dentro del archivo (ignorados): ${duplicatesInFile.toLocaleString()}`);
  }
  if (dryRun) {
    console.log("--dry-run: no se escribió nada en la base de datos.");
  } else {
    console.log(`Insertados: ${inserted.toLocaleString()}`);
    console.log(`Ya existían, intactos: ${skipped.toLocaleString()}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Importación fallida:", err);
    process.exit(1);
  });
