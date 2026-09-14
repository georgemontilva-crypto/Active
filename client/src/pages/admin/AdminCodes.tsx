import {
  AdminLayout,
  Card,
  Field,
  buttonClass,
  inputClass,
} from "@/components/AdminLayout";
import { Pagination, TableCard } from "@/components/admin/AdminTable";
import { trpc } from "@/lib/trpc";
import { DEFAULT_MAX_VERIFICATIONS } from "@shared/const";
import {
  Ban,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function AdminCodes() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Shared by both the single-add form and the bulk import, since in practice a
  // batch of codes arrives from the client as one file for one product.
  const [productId, setProductId] = useState<number | "">("");
  const [batch, setBatch] = useState("");
  const [maxVerifications, setMaxVerifications] = useState(
    DEFAULT_MAX_VERIFICATIONS
  );
  const [newCode, setNewCode] = useState("");
  const [pasted, setPasted] = useState("");

  // Reasignación de códigos ya cargados
  const [scopeKind, setScopeKind] = useState<
    "unassigned" | "batch" | "search" | "all"
  >("unassigned");
  const [scopeValue, setScopeValue] = useState("");
  const [assignProductId, setAssignProductId] = useState<number | "">("");
  const [assignBatch, setAssignBatch] = useState("");

  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const products = trpc.catalog.adminProducts.useQuery(undefined, {
    retry: false,
  });
  const list = trpc.codes.adminList.useQuery(
    { search: query || undefined, page, pageSize: 50 },
    { retry: false }
  );

  const common = () => ({
    productId: productId === "" ? null : Number(productId),
    batch: batch.trim() || null,
    maxVerifications,
  });

  const refresh = () => {
    utils.codes.adminList.invalidate();
    utils.adminAuth.dashboardOverview.invalidate();
  };

  const add = trpc.codes.adminAdd.useMutation({
    onSuccess: () => {
      setNewCode("");
      refresh();
      toast.success("Code added");
    },
    onError: e => toast.error(e.message || "Could not add code"),
  });

  /**
   * La importación va por bloques desde el navegador.
   *
   * Un archivo del cliente trae cientos de miles de códigos. Mandarlo entero en
   * una sola petición deja al servidor escribiendo varios minutos con la
   * conexión abierta, y si el navegador, el proxy o la pestaña se rinden a
   * mitad de camino no hay forma de saber cuántos entraron. En bloques, cada
   * petición termina en segundos, lo ya insertado queda insertado, y reintentar
   * es gratis porque los repetidos se descartan solos.
   */
  const bulk = trpc.codes.adminBulkImport.useMutation();

  const CHUNK = 5000;

  const parseCodes = (text: string) =>
    text
      .split(/[\r\n,;\t]+/)
      .map(t => t.trim().replace(/^["']|["']$/g, ""))
      .filter(
        t =>
          t.length > 0 &&
          !/^(id|code|codes|created|updated|product|batch)$/i.test(t)
      );

  const runImport = async (text: string) => {
    const codes = parseCodes(text);
    if (codes.length === 0) {
      toast.error("No codes found in that file");
      return;
    }

    let processed = 0;
    let skipped = 0;
    setImportProgress({ done: 0, total: codes.length });

    try {
      for (let i = 0; i < codes.length; i += CHUNK) {
        const slice = codes.slice(i, i + CHUNK);
        const r = await bulk.mutateAsync({
          content: slice.join("\n"),
          ...common(),
        });
        processed += r.processed;
        skipped += r.skipped;
        setImportProgress({
          done: Math.min(i + CHUNK, codes.length),
          total: codes.length,
        });
      }
      toast.success(
        skipped > 0
          ? `Imported ${processed.toLocaleString()} codes (${skipped.toLocaleString()} already existed and were left untouched)`
          : `Imported ${processed.toLocaleString()} codes`
      );
      setPasted("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error(
        `Import stopped after ${processed.toLocaleString()} codes: ${
          e instanceof Error ? e.message : "unknown error"
        }. The codes already imported were kept — run it again to continue.`
      );
    } finally {
      setImportProgress(null);
      refresh();
    }
  };

  const assign = trpc.codes.adminBulkAssign.useMutation({
    onSuccess: r => {
      refresh();
      toast.success(`${r.updated.toLocaleString()} codes updated`);
    },
    onError: e => toast.error(e.message || "Could not update those codes"),
  });

  const buildScope = () => {
    if (scopeKind === "batch")
      return { kind: "batch" as const, batch: scopeValue.trim() };
    if (scopeKind === "search")
      return { kind: "search" as const, search: scopeValue.trim() };
    if (scopeKind === "all") return { kind: "all" as const };
    return { kind: "unassigned" as const };
  };

  const runAssign = async () => {
    const scope = buildScope();
    if (
      (scope.kind === "batch" || scope.kind === "search") &&
      !scopeValue.trim()
    ) {
      toast.error("Type the batch or the text to match first");
      return;
    }
    if (assignProductId === "" && !assignBatch.trim()) {
      toast.error("Pick a product or type a batch to assign");
      return;
    }

    // El conteo se pide antes de escribir: "asignar a todos" sobre esta tabla
    // toca cada código en circulación, y el número es lo único que deja ver
    // que el alcance no es el que se creía.
    const { count } = await utils.codes.adminCountScope.fetch(scope);
    if (count === 0) {
      toast.error("No codes match that scope");
      return;
    }
    const target =
      assignProductId === ""
        ? `batch ${assignBatch.trim()}`
        : (products.data?.find(p => p.id === Number(assignProductId))?.name ??
          "that product");
    if (
      !confirm(
        `Assign ${count.toLocaleString()} codes to ${target}? This overwrites what they have now.`
      )
    ) {
      return;
    }

    assign.mutate({
      scope,
      ...(assignProductId === "" ? {} : { productId: Number(assignProductId) }),
      ...(assignBatch.trim() ? { batch: assignBatch.trim() } : {}),
    });
  };

  const del = trpc.codes.adminDelete.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Code deleted");
    },
  });

  const reset = trpc.codes.adminResetCount.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Verification count reset");
    },
  });

  const update = trpc.codes.adminUpdate.useMutation({ onSuccess: refresh });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runImport(await file.text());
  };

  return (
    <AdminLayout title="Verification Codes">
      {/* Settings applied to whatever is added below */}
      <Card
        title="Apply to new codes"
        description="These are attached to every code you add or import below. They don't affect codes already in the list."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Product">
            <select
              value={productId}
              onChange={e =>
                setProductId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              className={inputClass}
            >
              <option value="">No product</option>
              {products.data?.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Batch"
            hint="Optional, shown on the verification result."
          >
            <input
              value={batch}
              onChange={e => setBatch(e.target.value)}
              placeholder="e.g. A1042"
              className={inputClass}
            />
          </Field>
          <Field
            label="Max checks"
            hint="How many times each code can be verified."
          >
            <input
              type="number"
              min={1}
              max={100}
              value={maxVerifications}
              onChange={e =>
                setMaxVerifications(Math.max(1, Number(e.target.value) || 1))
              }
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card
          title="Import codes"
          description="Upload a CSV or TXT file, or paste a list. One code per line or comma-separated. Codes that already exist are skipped, never reset."
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/plain,text/csv"
            onChange={onFile}
            className="block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-[#ec008c] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/10"
          />
          <textarea
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            rows={4}
            placeholder={"ABCD12345\nABCD12346\nABCD12347"}
            className={`${inputClass} mt-3 font-mono`}
          />
          <button
            onClick={() => pasted.trim() && runImport(pasted)}
            disabled={importProgress !== null || !pasted.trim()}
            className={`${buttonClass} mt-3`}
          >
            {importProgress !== null ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Import pasted list
          </button>

          {importProgress && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/50">
                <span>
                  {importProgress.done.toLocaleString()} /{" "}
                  {importProgress.total.toLocaleString()}
                </span>
                <span>Keep this tab open</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#f5e400] transition-all"
                  style={{
                    width: `${Math.round((importProgress.done / importProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Add a single code"
          description="Useful for a replacement label or a one-off."
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              if (newCode.trim())
                add.mutate({ code: newCode.trim(), ...common() });
            }}
            className="flex gap-2"
          >
            <input
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              placeholder="ABCD12345"
              className={`${inputClass} font-mono`}
            />
            <button
              type="submit"
              disabled={add.isPending || !newCode.trim()}
              className={buttonClass}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
        </Card>
      </div>

      {/* Reasignación de códigos ya cargados */}
      <div className="mt-5">
        <Card
          title="Assign product to existing codes"
          description="For codes already in the database. Useful when the client's file arrives before it's decided which product it belongs to."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Which codes">
              <select
                value={scopeKind}
                onChange={e => setScopeKind(e.target.value as typeof scopeKind)}
                className={inputClass}
              >
                <option value="unassigned">Codes with no product</option>
                <option value="batch">Codes in a batch</option>
                <option value="search">Codes matching text</option>
                <option value="all">Every code</option>
              </select>
            </Field>

            <Field
              label={scopeKind === "batch" ? "Batch to match" : "Text to match"}
              hint={
                scopeKind === "unassigned" || scopeKind === "all"
                  ? "Not needed for this scope."
                  : undefined
              }
            >
              <input
                value={scopeValue}
                onChange={e => setScopeValue(e.target.value)}
                disabled={scopeKind === "unassigned" || scopeKind === "all"}
                placeholder={scopeKind === "batch" ? "SD260813-078" : "9395"}
                className={`${inputClass} disabled:opacity-40`}
              />
            </Field>

            <Field label="Assign product">
              <select
                value={assignProductId}
                onChange={e =>
                  setAssignProductId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className={inputClass}
              >
                <option value="">Leave as is</option>
                {products.data?.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Assign batch"
              hint="Leave empty to keep the batch they have."
            >
              <input
                value={assignBatch}
                onChange={e => setAssignBatch(e.target.value)}
                placeholder="SD260813-078"
                className={inputClass}
              />
            </Field>
          </div>

          <button
            onClick={runAssign}
            disabled={assign.isPending}
            className={`${buttonClass} mt-4`}
          >
            {assign.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Tag className="h-4 w-4" />
            )}
            Assign
          </button>
          <p className="mt-2 text-xs text-white/40">
            You'll see how many codes match and have to confirm before anything
            is written.
          </p>
        </Card>
      </div>

      {/* List */}
      <div className="mt-6">
        <form
          onSubmit={e => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search code or batch…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button className={buttonClass}>Search</button>
        </form>

        <TableCard>
          {/* Scroll propio de la tabla, no de la página: con 50 filas por
              página, dejar que la página entera se desplace esconde el
              buscador y el paginador justo cuando hacen falta. La cabecera
              queda pegada arriba para no perder de vista qué columna es qué. */}
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#1b1428] text-left text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Product</th>
                  <th className="px-5 py-3 font-semibold">Batch</th>
                  <th className="px-5 py-3 font-semibold">Checks</th>
                  <th className="px-5 py-3 font-semibold">Last checked</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {list.isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-white/40"
                    >
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : list.data && list.data.rows.length > 0 ? (
                  list.data.rows.map(c => {
                    const spent = c.verificationCount >= c.maxVerifications;
                    return (
                      <tr
                        key={c.id}
                        className={
                          c.disabled
                            ? "bg-white/[0.04]"
                            : "hover:bg-white/[0.05]"
                        }
                      >
                        <td className="px-5 py-3">
                          <span className="rounded-md bg-[#0a0812] px-2 py-1 font-mono text-xs font-semibold">
                            {c.code}
                          </span>
                          {c.disabled && (
                            <span className="ml-2 rounded-full bg-[#0b0812] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-white/60">
                          {c.productName ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-white/50">
                          {c.batch ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={
                              spent
                                ? "rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-red-300"
                                : c.verificationCount > 0
                                  ? "rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-200"
                                  : "rounded-full bg-[#0a0812] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white/60"
                            }
                          >
                            {c.verificationCount} / {c.maxVerifications}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-white/50">
                          {c.lastVerifiedAt
                            ? new Date(c.lastVerifiedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title={
                                c.disabled ? "Re-enable code" : "Disable code"
                              }
                              onClick={() =>
                                update.mutate({
                                  id: c.id,
                                  disabled: !c.disabled,
                                })
                              }
                              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-[#f5e400]"
                            >
                              {c.disabled ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              title="Reset verification count"
                              onClick={() => reset.mutate({ id: c.id })}
                              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-[#f5e400]"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            <button
                              title="Delete code"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete code ${c.code}? This cannot be undone.`
                                  )
                                ) {
                                  del.mutate({ id: c.id });
                                }
                              }}
                              className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/15 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-white/40"
                    >
                      No codes found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pagination
              page={page}
              pageSize={50}
              total={list.data.total}
              onChange={setPage}
            />
          )}
        </TableCard>
      </div>
    </AdminLayout>
  );
}
