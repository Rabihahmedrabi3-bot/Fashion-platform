import { AppShell, type AppShellNavItem } from "@fashion-platform/ui";
import { Navigate, NavLink as RouterNavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Tenants", href: "/tenants" },
  { label: "Audit Logs", href: "/audit-logs" },
  { label: "Settings", href: "/settings" },
];

export function AppLayout() {
  const { status, me, logout } = useAuth();

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  if (status === "unauthenticated" || !me) {
    return <Navigate to="/login" replace />;
  }

  if (!me.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-slate-600">
          {me.user.email} is signed in but doesn&rsquo;t hold platform admin access.
        </p>
        <button type="button" onClick={() => void logout()} className="text-sm font-medium text-slate-900 underline">
          Log out
        </button>
      </div>
    );
  }

  return (
    <AppShell
      storeName="Platform Admin"
      userLabel={me.user.email}
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
      <Outlet />
    </AppShell>
  );
}
