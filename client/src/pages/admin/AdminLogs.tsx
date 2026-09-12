import { AdminLayout, buttonClass, inputClass } from "@/components/AdminLayout";
import { Pagination, TableCard } from "@/components/admin/AdminTable";
import { trpc } from "@/lib/trpc";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";

type ResultFilter = "" | "valid" | "not_found" | "limit_reached" | "disabled";

const RESULTS: { value: ResultFilter; label: string }[] = [
  { value: "", label: "All results" },
  { value: "valid", label: "Authentic" },
  { value: "not_found", label: "Not found" },
  { value: "limit_reached", label: "Over limit" },
  { value: "disabled", label: "Disabled" },
];

const BADGE: Record<string, string> = {
  valid: "bg-emerald-500/15 text-emerald-300",
  not_found: "bg-red-500/15 text-red-300",
  limit_reached: "bg-amber-400/15 text-amber-200",
  disabled: "bg-[#0b0812] text-white",
};

const LABEL: Record<string, string> = {
  valid: "Authentic",
  not_found: "Not found",
  limit_reached: "Over limit",
  disabled: "Disabled",
};

export default function AdminLogs() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResultFilter>("");
  const [page, setPage] = useState(1);

  const list = trpc.codes.adminLogs.useQuery(
    {
      search: query || undefined,
      result: result === "" ? undefined : result,
      page,
      pageSize: 50,
    },
    { retry: false }
  );

  return (
    <AdminLayout title="Query Logs">
      <p className="mb-4 max-w-2xl text-sm text-white/50">
        Every verification attempt, including the ones the customer saw as invalid.
        A code showing repeated <strong>Over limit</strong> hits from different
        addresses is the signal that its label is being copied.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
        className="mb-4 flex flex-wrap gap-2"
      >
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={result}
          onChange={(e) => {
            setPage(1);
            setResult(e.target.value as ResultFilter);
          }}
          className={`${inputClass} sm:w-44`}
        >
          {RESULTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button className={buttonClass}>Search</button>
      </form>

      <TableCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-left text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 font-semibold">Result</th>
                <th className="px-5 py-3 font-semibold">Check #</th>
                <th className="px-5 py-3 font-semibold">Time</th>
                <th className="px-5 py-3 font-semibold">IP</th>
                <th className="px-5 py-3 font-semibold">User agent</th>
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
                list.data.rows.map((l) => (
                  <tr key={l.id} className="hover:bg-white/[0.05]">
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-[#0a0812] px-2 py-1 font-mono text-xs font-semibold">
                        {l.code}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          BADGE[l.result] ?? "bg-[#0a0812] text-white/60"
                        }`}
                      >
                        {LABEL[l.result] ?? l.result}
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-white/50">
                      {l.attemptNumber ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-white/50">
                      {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-white/50">{l.ip ?? "—"}</td>
                    <td
                      className="max-w-xs truncate px-5 py-3 text-xs text-white/40"
                      title={l.userAgent ?? ""}
                    >
                      {l.userAgent ?? "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-white/40">
                    No attempts logged yet.
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
    </AdminLayout>
  );
}
