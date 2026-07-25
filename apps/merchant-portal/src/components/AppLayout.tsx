import { AppShell, type AppShellNavItem } from "@fashion-platform/ui";
import { Navigate, NavLink as RouterNavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Store Profile", href: "/store" },
  { label: "Theme", href: "/theme" },
  { label: "Categories", href: "/categories" },
  { label: "Collections", href: "/collections" },
  { label: "Products", href: "/products" },
  { label: "Orders", href: "/orders" },
  { label: "Staff", href: "/staff" },
];

export function AppLayout() {
  const { status, me, selectedTenantId, selectTenant, logout } = useAuth();

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  if (status === "unauthenticated" || !me) {
    return <Navigate to="/login" replace />;
  }

  const activeMemberships = me.memberships.filter((m) => m.membershipStatus === "active");

  if (activeMemberships.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  const currentMembership =
    activeMemberships.find((m) => m.tenantId === selectedTenantId) ?? activeMemberships[0];

  if (!currentMembership) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <AppShell
      storeName={currentMembership.tenantName}
      userLabel={`${me.user.email} · ${currentMembership.roleKey}`}
      navItems={NAV_ITEMS}
      onLogout={() => void logout()}
      renderLink={(item) => (
        <RouterNavLink
          to={item.href}
          end={item.href === "/"}
          className={({ isActive }) =>
            `block rounded-md px-3 py-2 text-sm font-medium ${
              isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`
          }
        >
          {item.label}
        </RouterNavLink>
      )}
    >
      {activeMemberships.length > 1 ? (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-slate-500">Store:</span>
          <select
            value={currentMembership.tenantId}
            onChange={(event) => selectTenant(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {activeMemberships.map((membership) => (
              <option key={membership.tenantId} value={membership.tenantId}>
                {membership.tenantName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Outlet context={{ tenantId: currentMembership.tenantId, roleKey: currentMembership.roleKey }} />
    </AppShell>
  );
}
