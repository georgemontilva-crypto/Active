import { AdminLayout, Card, Field, buttonClass, inputClass } from "@/components/AdminLayout";
import { Pagination, TableCard } from "@/components/admin/AdminTable";
import { trpc } from "@/lib/trpc";
import { DEFAULT_MAX_VERIFICATIONS } from "@shared/const";
import { Ban, Check, Loader2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
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
  const [maxVerifications, setMaxVerifications] = useState(DEFAULT_MAX_VERIFICATIONS);
  const [newCode, setNewCode] = useState("");
  const [pasted, setPasted] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const products = trpc.catalog.adminProducts.useQuery(undefined, { retry: false });
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
    onError: (e) => toast.error(e.message || "Could not add code"),
  });

  const bulk = trpc.codes.adminBulkImport.useMutation({
    onSuccess: (r) => {
      refresh();
      setPasted("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success(
        r.skipped > 0
          ? `Imported ${r.processed} codes (${r.skipped} already existed and were left untouched)`
          : `Imported ${r.processed} codes`
      );
    },
    onError: (e) => toast.error(e.message || "Import failed"),
  });

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
    bulk.mutate({ content: await file.text(), ...common() });
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
              onChange={(e) => setProductId(e.target.value === "" ? "" : Number(e.target.value))}
              className={inputClass}
            >
              <option value="">No product</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Batch" hint="Optional, shown on the verification result.">
            <input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="e.g. A1042"
              className={inputClass}
            />
          </Field>
          <Field label="Max checks" hint="How many times each code can be verified.">
            <input
              type="number"
              min={1}
              max={100}
              value={maxVerifications}
              onChange={(e) => setMaxVerifications(Math.max(1, Number(e.target.value) || 1))}
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
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder={"ABCD12345\nABCD12346\nABCD12347"}
            className={`${inputClass} mt-3 font-mono`}
          />
          <button
            onClick={() => pasted.trim() && bulk.mutate({ content: pasted, ...common() })}
            disabled={bulk.isPending || !pasted.trim()}
            className={`${buttonClass} mt-3`}
          >
            {bulk.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Import pasted list
          </button>
        </Card>

        <Card title="Add a single code" description="Useful for a replacement label or a one-off.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newCode.trim()) add.mutate({ code: newCode.trim(), ...common() });
            }}
            className="flex gap-2"
          >
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="ABCD12345"
              className={`${inputClass} font-mono`}
            />
            <button type="submit" disabled={add.isPending || !newCode.trim()} className={buttonClass}>
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
        </Card>
      </div>

      {/* List */}
      <div className="mt-6">
        <form
          onSubmit={(e) => {
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or batch…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button className={buttonClass}>Search</button>
        </form>

        <TableCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-left text-xs uppercase tracking-wider text-white/50">
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
                    <td colSpan={6} className="px-5 py-10 text-center text-white/40">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : list.data && list.data.rows.length > 0 ? (
                  list.data.rows.map((c) => {
                    const spent = c.verificationCount >= c.maxVerifications;
                    return (
                      <tr key={c.id} className={c.disabled ? "bg-white/[0.04]" : "hover:bg-white/[0.05]"}>
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
                        <td className="px-5 py-3 text-white/60">{c.productName ?? "—"}</td>
                        <td className="px-5 py-3 text-white/50">{c.batch ?? "—"}</td>
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
                          {c.lastVerifiedAt ? new Date(c.lastVerifiedAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title={c.disabled ? "Re-enable code" : "Disable code"}
                              onClick={() => update.mutate({ id: c.id, disabled: !c.disabled })}
                              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-[#f5e400]"
                            >
                              {c.disabled ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
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
                                if (confirm(`Delete code ${c.code}? This cannot be undone.`)) {
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
                    <td colSpan={6} className="px-5 py-10 text-center text-white/40">
                      No codes found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pagination page={page} pageSize={50} total={list.data.total} onChange={setPage} />
          )}
        </TableCard>
      </div>
    </AdminLayout>
  );
}
