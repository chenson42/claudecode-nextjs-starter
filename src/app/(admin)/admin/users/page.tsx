import { db } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { assignRoleAction, removeRoleAction } from "./actions";

export default async function UsersPage() {
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const allRoles = await db
    .select({ id: roles.id, name: roles.name, displayName: roles.displayName })
    .from(roles)
    .orderBy(roles.sortOrder);

  const rolesByUser = new Map<string, string[]>();
  if (allUsers.length > 0) {
    const ur = await db
      .select({ userId: userRoles.userId, roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id));
    for (const row of ur) {
      const list = rolesByUser.get(row.userId) ?? [];
      list.push(row.roleName);
      rolesByUser.set(row.userId, list);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Assign roles to users. Admins receive every feature automatically.
      </p>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2">User</th>
            <th>Roles</th>
            <th>Last login</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {allUsers.map((u) => {
            const userRoleList = rolesByUser.get(u.id) ?? [];
            return (
              <tr key={u.id} className="border-b border-border">
                <td className="py-3">
                  <div className="font-medium">{u.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {userRoleList.map((r) => (
                      <form key={r} action={removeRoleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="roleName" value={r} />
                        <button
                          type="submit"
                          className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-red-500/10"
                          title="Remove role"
                        >
                          {r} ×
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
                <td className="text-xs text-muted-foreground">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                </td>
                <td>{u.isActive ? "yes" : "no"}</td>
                <td>
                  <form action={assignRoleAction} className="flex gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      name="roleId"
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {allRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded bg-foreground px-2 py-1 text-xs text-background"
                    >
                      Add
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
