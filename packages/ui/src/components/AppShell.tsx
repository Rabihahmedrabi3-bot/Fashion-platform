import type { ReactNode } from "react";

export interface AppShellNavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface AppShellProps {
  storeName: string;
  userLabel: string;
  navItems: AppShellNavItem[];
  onLogout: () => void;
  children: ReactNode;
  /** Router-agnostic: the app supplies its own Link component per nav item. */
  renderLink: (item: AppShellNavItem) => ReactNode;
}

export function AppShell({ storeName, userLabel, navItems, onLogout, children, renderLink }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="truncate text-sm font-semibold text-slate-900">{storeName}</p>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => (
            <div key={item.href}>{renderLink(item)}</div>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-xs text-slate-500">{userLabel}</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-1 text-xs font-medium text-slate-700 hover:text-slate-900"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
