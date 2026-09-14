import {
  AdminLayout,
  Card,
  Field,
  buttonClass,
  inputClass,
} from "@/components/AdminLayout";
import { useR2Upload } from "@/hooks/useR2Upload";
import { trpc } from "@/lib/trpc";
import {
  Check,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${mb.toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function AdminLabReports() {
  const utils = trpc.useUtils();
  const products = trpc.catalog.adminProducts.useQuery(undefined, {
    retry: false,
  });
  // Si faltan variables de R2 la subida no puede funcionar, y conviene decirlo
  // antes de que elija el archivo y no después de que falle.
  const storage = trpc.catalog.storageStatus.useQuery(undefined, {
    retry: false,
  });

  const [productId, setProductId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [batch, setBatch] = useState("");
  const [lab, setLab] = useState("");
  const [testedOn, setTestedOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // Reports already hosted elsewhere (the WordPress uploads folder, say) can be
  // linked instead of re-uploaded, so the same PDF isn't stored twice.
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [externalUrl, setExternalUrl] = useState("");

  const { upload, progress, isUploading } = useR2Upload();

  const refresh = () => {
    utils.catalog.adminProducts.invalidate();
    utils.catalog.publicReports.invalidate();
    utils.adminAuth.dashboardOverview.invalidate();
  };

  const create = trpc.catalog.createLabReport.useMutation({
    onSuccess: () => {
      setTitle("");
      setBatch("");
      setLab("");
      setTestedOn("");
      setFile(null);
      setExternalUrl("");
      refresh();
      toast.success("Lab report published");
    },
    onError: e => toast.error(e.message || "Could not save the report"),
  });

  const update = trpc.catalog.updateLabReport.useMutation({
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
    onError: e => toast.error(e.message || "Could not save the changes"),
  });

  /** Reporte abierto en edición. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const editUpload = useR2Upload();

  /**
   * Guarda los cambios de un reporte y, si hay archivo nuevo, lo sube antes.
   *
   * El orden importa: primero R2, después la fila. Si la subida falla, el
   * reporte se queda intacto apuntando a su PDF de siempre, que es mucho mejor
   * que una fila editada apuntando a un archivo que no llegó a existir.
   */
  const saveEdit = async (
    id: number,
    values: {
      title: string;
      batch: string | null;
      lab: string | null;
      testedOn: string | null;
    },
    file: File | null
  ) => {
    try {
      if (file) {
        const up = await editUpload.upload(file, "lab-report");
        update.mutate({
          id,
          ...values,
          fileUrl: up.publicUrl,
          fileKey: up.storageKey,
          fileName: up.fileName,
          sizeBytes: up.sizeBytes,
        });
        return;
      }
      update.mutate({ id, ...values });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };
  const remove = trpc.catalog.deleteLabReport.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Report deleted");
    },
  });

  /**
   * Validación con motivo, en vez de un botón apagado.
   *
   * Antes el botón se deshabilitaba solo si faltaba producto, título o archivo,
   * y desde fuera un botón apagado es indistinguible de uno roto: se hace clic,
   * no pasa nada y no hay forma de saber qué falta. Ahora el botón siempre
   * responde y dice exactamente qué le falta.
   */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (productId === "") {
      toast.error("Pick the product this report belongs to");
      return;
    }
    if (!title.trim()) {
      toast.error("The report needs a title");
      return;
    }
    if (mode === "upload" && !file) {
      toast.error("Choose the PDF to upload");
      return;
    }
    if (mode === "link" && !externalUrl.trim()) {
      toast.error("Paste the URL of the report");
      return;
    }
    if (mode === "upload" && storage.data && !storage.data.configured) {
      toast.error(
        `Uploads are off until R2 is set up in Railway. Missing: ${storage.data.missing.join(", ")}`
      );
      return;
    }

    const base = {
      productId: Number(productId),
      title: title.trim(),
      batch: batch.trim() || null,
      lab: lab.trim() || null,
      testedOn: testedOn || null,
    };

    if (mode === "link") {
      const url = externalUrl.trim();
      create.mutate({
        ...base,
        fileUrl: url,
        fileKey: "",
        fileName: url.split("/").pop() || null,
      });
      return;
    }

    try {
      const up = await upload(file!, "lab-report");
      create.mutate({
        ...base,
        fileUrl: up.publicUrl,
        fileKey: up.storageKey,
        fileName: up.fileName,
        sizeBytes: up.sizeBytes,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const noProducts = products.data?.length === 0;
  const busy = isUploading || create.isPending;

  return (
    <AdminLayout title="Lab Reports">
      {storage.data && !storage.data.configured && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-200">
          <p className="font-semibold">
            Uploads are off: R2 isn&apos;t configured.
          </p>
          <p className="mt-1">
            Missing in Railway:{" "}
            <span className="font-mono">{storage.data.missing.join(", ")}</span>
            . You can still add reports with the <strong>Link</strong> mode
            meanwhile.
          </p>
        </div>
      )}

      {noProducts && (
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-200">
          Create a product first — every lab report belongs to one.
        </div>
      )}

      <Card
        title="Upload a report"
        description="PDF only. The file goes straight to R2 from your browser."
      >
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
                <option value="">Select a product…</option>
                {products.data?.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" hint="What the customer sees in the list.">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Potency & Purity — Batch A1042"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Batch"
              hint="Match the number printed on the package."
            >
              <input
                value={batch}
                onChange={e => setBatch(e.target.value)}
                placeholder="A1042"
                className={inputClass}
              />
            </Field>
            <Field label="Lab">
              <input
                value={lab}
                onChange={e => setLab(e.target.value)}
                placeholder="Kaycha Labs"
                className={inputClass}
              />
            </Field>
            <Field label="Tested on">
              <input
                type="date"
                value={testedOn}
                onChange={e => setTestedOn(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex gap-2">
            {(["upload", "link"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "rounded-xl bg-[#ec008c] px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/60 hover:bg-white/[0.05]"
                }
              >
                {m === "upload" ? "Upload a PDF" : "Link an existing PDF"}
              </button>
            ))}
          </div>

          {mode === "upload" ? (
            <Field label="PDF file">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={e => {
                  const picked = e.target.files?.[0] ?? null;
                  setFile(picked);
                  // El título es obligatorio y el nombre del archivo casi
                  // siempre sirve: se propone, y se puede cambiar. Solo si
                  // está vacío, para no pisar lo que ya escribió.
                  if (picked && !title.trim()) {
                    setTitle(
                      picked.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ")
                    );
                  }
                }}
                className="block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-[#ec008c] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/10"
              />
            </Field>
          ) : (
            <Field
              label="PDF URL"
              hint="The file stays where it is; only the link is saved."
            >
              <input
                value={externalUrl}
                onChange={e => setExternalUrl(e.target.value)}
                placeholder="https://…/COA.pdf"
                className={inputClass}
              />
            </Field>
          )}

          {isUploading && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[#f5e400] transition-all"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          )}

          <div>
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isUploading ? `Uploading ${progress ?? 0}%` : "Publish report"}
            </button>
          </div>
        </form>
      </Card>

      <div className="mt-6 space-y-5">
        {products.data
          ?.filter(p => p.reports.length > 0)
          .map(product => (
            <div
              key={product.id}
              className="rounded-2xl border border-white/10 bg-[#130e1e]"
            >
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="font-display text-lg font-semibold">
                  {product.name}
                </h2>
                <p className="text-sm text-white/50">
                  {product.reports.length} report
                  {product.reports.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="divide-y divide-white/10">
                {product.reports.map(r => (
                  <li key={r.id} className="px-5 py-3.5 text-sm">
                    {editingId === r.id ? (
                      <EditReportForm
                        report={r}
                        busy={update.isPending || editUpload.isUploading}
                        progress={
                          editUpload.isUploading ? editUpload.progress : null
                        }
                        onCancel={() => setEditingId(null)}
                        onSave={(values, file) => saveEdit(r.id, values, file)}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-white/40" />
                        <a
                          href={r.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                        >
                          {r.title}
                        </a>
                        <span className="shrink-0 text-xs text-white/40">
                          {[
                            r.batch ? `Batch ${r.batch}` : null,
                            r.testedOn,
                            formatSize(r.sizeBytes),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <button
                          title="Edit report"
                          onClick={() => setEditingId(r.id)}
                          className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-[#f5e400]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          title={
                            r.published
                              ? "Hide from the public page"
                              : "Publish"
                          }
                          onClick={() =>
                            update.mutate({ id: r.id, published: !r.published })
                          }
                          className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-[#f5e400]"
                        >
                          {r.published ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          title="Delete report"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete "${r.title}"? The PDF is removed from storage too.`
                              )
                            ) {
                              remove.mutate({ id: r.id });
                            }
                          }}
                          className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/15 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </AdminLayout>
  );
}

/**
 * Edición en línea de un reporte ya cargado.
 *
 * El estado vive aquí y no en la página para que empezar a editar otro reporte
 * no arrastre lo escrito en el anterior, y para que cancelar sea de verdad
 * cancelar: al desmontarse, lo tecleado desaparece.
 */
function EditReportForm({
  report,
  busy,
  progress,
  onCancel,
  onSave,
}: {
  report: {
    id: number;
    title: string;
    batch: string | null;
    lab: string | null;
    testedOn: string | null;
    fileName: string | null;
  };
  busy: boolean;
  progress: number | null;
  onCancel: () => void;
  onSave: (
    values: {
      title: string;
      batch: string | null;
      lab: string | null;
      testedOn: string | null;
    },
    file: File | null
  ) => void;
}) {
  const [title, setTitle] = useState(report.title);
  const [batch, setBatch] = useState(report.batch ?? "");
  const [lab, setLab] = useState(report.lab ?? "");
  const [testedOn, setTestedOn] = useState(report.testedOn ?? "");
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="rounded-xl border border-[#ec008c]/40 bg-white/[0.04] p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Batch">
          <input
            value={batch}
            onChange={e => setBatch(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Lab">
          <input
            value={lab}
            onChange={e => setLab(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Tested on">
          <input
            type="date"
            value={testedOn}
            onChange={e => setTestedOn(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field
          label="Replace PDF"
          hint={
            file
              ? `${file.name} will replace ${report.fileName ?? "the current file"}.`
              : "Leave empty to keep the current file."
          }
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className={inputClass}
          />
        </Field>
      </div>

      {progress !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[#f5e400] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          disabled={busy || !title.trim()}
          onClick={() =>
            onSave(
              {
                title: title.trim(),
                batch: batch.trim() || null,
                lab: lab.trim() || null,
                testedOn: testedOn || null,
              },
              file
            )
          }
          className={buttonClass}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {progress !== null ? `Uploading ${progress}%` : "Save changes"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="press inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
