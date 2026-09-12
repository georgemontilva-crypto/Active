import { AdminLayout, Card, Field, buttonClass, inputClass } from "@/components/AdminLayout";
import { useR2Upload } from "@/hooks/useR2Upload";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminProducts() {
  const utils = trpc.useUtils();
  const products = trpc.catalog.adminProducts.useQuery(undefined, { retry: false });

  const [name, setName] = useState("");
  const [collection, setCollection] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");

  const refresh = () => {
    utils.catalog.adminProducts.invalidate();
    utils.catalog.publicReports.invalidate();
    utils.adminAuth.dashboardOverview.invalidate();
  };

  const create = trpc.catalog.createProduct.useMutation({
    onSuccess: () => {
      setName("");
      setCollection("");
      setSubtitle("");
      setDescription("");
      refresh();
      toast.success("Product created");
    },
    onError: (e) => toast.error(e.message || "Could not create product"),
  });

  return (
    <AdminLayout title="Products">
      <Card
        title="New product"
        description="Lab reports and verification codes are both attached to a product, so create these first."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              create.mutate({
                name: name.trim(),
                collection: collection.trim() || null,
                subtitle: subtitle.trim() || null,
                description: description.trim() || null,
              });
            }
          }}
          className="grid gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Product line" hint="The heading these are grouped under.">
              <input
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="QUANTUM COMPLEX"
                className={inputClass}
              />
            </Field>
            <Field label="Name" hint="The flavour or variant.">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Strawberry"
                className={inputClass}
              />
            </Field>
            <Field label="Subtitle">
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="10 COUNT DISPLAY - 80MG PER TAB"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
          <div>
            <button type="submit" disabled={create.isPending || !name.trim()} className={buttonClass}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create product
            </button>
          </div>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {products.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : products.data?.length ? (
          products.data.map((p) => <ProductRow key={p.id} product={p} onChanged={refresh} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/40">
            No products yet.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

type ProductRowProps = {
  product: {
    id: number;
    name: string;
    slug: string;
    collection: string | null;
    subtitle: string | null;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    published: boolean;
    reports: unknown[];
  };
  onChanged: () => void;
};

function ProductRow({ product, onChanged }: ProductRowProps) {
  const [name, setName] = useState(product.name);
  const [collection, setCollection] = useState(product.collection ?? "");
  const [subtitle, setSubtitle] = useState(product.subtitle ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [sortOrder, setSortOrder] = useState(product.sortOrder);
  const { upload, progress, isUploading } = useR2Upload();

  const update = trpc.catalog.updateProduct.useMutation({
    onSuccess: () => {
      onChanged();
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message || "Could not save"),
  });

  const remove = trpc.catalog.deleteProduct.useMutation({
    onSuccess: () => {
      onChanged();
      toast.success("Product deleted");
    },
  });

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await upload(file, "product-image");
      update.mutate({ id: product.id, imageUrl: up.publicUrl, imageKey: up.storageKey });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#130e1e] p-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl bg-[#0a0812]">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-1.5" />
            ) : (
              <ImagePlus className="h-6 w-6 text-white/70" />
            )}
          </div>
          <label className="mt-2 block cursor-pointer text-center text-xs font-semibold text-white/50 underline underline-offset-2 hover:text-[#f5e400]">
            {isUploading ? `${progress}%` : "Change image"}
            <input type="file" accept="image/*" onChange={onImage} className="hidden" />
          </label>
        </div>

        <div className="grid flex-1 gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Product line">
              <input
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Subtitle">
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sort order" hint="Lower appears first on the Lab Reports page.">
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </Field>
            <Field label="Slug">
              <input value={product.slug} readOnly className={`${inputClass} bg-white/[0.04] text-white/50`} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                update.mutate({
                  id: product.id,
                  name: name.trim(),
                  collection: collection.trim() || null,
                  subtitle: subtitle.trim() || null,
                  description: description.trim() || null,
                  sortOrder,
                })
              }
              disabled={update.isPending}
              className={buttonClass}
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>

            <button
              onClick={() => update.mutate({ id: product.id, published: !product.published })}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/[0.05]"
            >
              {product.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {product.published ? "Published" : "Hidden"}
            </button>

            <button
              onClick={() => {
                if (
                  confirm(
                    `Delete "${product.name}"? Its ${product.reports.length} lab report(s) and their PDFs will be deleted too. Codes pointing at it will stay valid but stop naming a product.`
                  )
                ) {
                  remove.mutate({ id: product.id });
                }
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/40 hover:bg-red-500/15 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
