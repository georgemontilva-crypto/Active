import { AdminLayout, Card, Field, buttonClass, inputClass } from "@/components/AdminLayout";
import { TableCard } from "@/components/admin/AdminTable";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminUsers() {
  const utils = trpc.useUtils();
  const me = trpc.adminAuth.me.useQuery(undefined, { retry: false });
  const admins = trpc.adminAuth.listAdmins.useQuery(undefined, { retry: false });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const create = trpc.adminAuth.createAdmin.useMutation({
    onSuccess: () => {
      setEmail("");
      setName("");
      setPassword("");
      utils.adminAuth.listAdmins.invalidate();
      toast.success("Admin created");
    },
    onError: (e) => toast.error(e.message || "Could not create admin"),
  });

  const remove = trpc.adminAuth.deleteAdmin.useMutation({
    onSuccess: () => {
      utils.adminAuth.listAdmins.invalidate();
      toast.success("Admin removed");
    },
    onError: (e) => toast.error(e.message || "Could not remove admin"),
  });

  const changePassword = trpc.adminAuth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed");
    },
    onError: (e) => toast.error(e.message || "Could not change password"),
  });

  return (
    <AdminLayout title="Admin Users">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Add an admin" description="Anyone added here has full access to this panel.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim() && password.length >= 8) {
                create.mutate({ email: email.trim(), password, name: name.trim() || undefined });
              }
            }}
            className="grid gap-4"
          >
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div>
              <button
                type="submit"
                disabled={create.isPending || !email.trim() || password.length < 8}
                className={buttonClass}
              >
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Create admin
              </button>
            </div>
          </form>
        </Card>

        <Card title="Change your password" description={me.data?.email ?? ""}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (currentPassword && newPassword.length >= 8) {
                changePassword.mutate({ currentPassword, newPassword });
              }
            }}
            className="grid gap-4"
          >
            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div>
              <button
                type="submit"
                disabled={changePassword.isPending || !currentPassword || newPassword.length < 8}
                className={buttonClass}
              >
                {changePassword.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Change password
              </button>
            </div>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <TableCard>
          {/* La tabla scrollea en horizontal dentro de la tarjeta: en un móvil
              no cabe, y sin esto empujaba el ancho de la página entera. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-left text-xs uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Last signed in</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {admins.isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-white/40">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : (
                admins.data?.map((a) => (
                  <tr key={a.id} className="hover:bg-white/[0.05]">
                    <td className="px-5 py-3 font-medium">
                      {a.email}
                      {a.id === me.data?.id && (
                        <span className="ml-2 rounded-full bg-[#0a0812] px-2 py-0.5 text-[10px] font-bold uppercase text-white/50">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-white/60">{a.name ?? "—"}</td>
                    <td className="px-5 py-3 text-white/50">
                      {a.lastSignedIn ? new Date(a.lastSignedIn).toLocaleString() : "Never"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {a.id !== me.data?.id && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove admin access for ${a.email}?`)) {
                              remove.mutate({ id: a.id });
                            }
                          }}
                          className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/15 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
        </TableCard>
      </div>
    </AdminLayout>
  );
}
