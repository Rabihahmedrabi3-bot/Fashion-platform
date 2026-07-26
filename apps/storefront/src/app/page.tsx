import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Fashion Platform</h1>
        <p className="mt-2 text-sm text-slate-500">
          Store storefronts are available at <code className="rounded bg-slate-100 px-1 py-0.5">/store/&lt;slug&gt;</code>.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Or browse products across every store in the{" "}
          <Link href="/marketplace" className="font-medium text-slate-900 underline">
            marketplace
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
