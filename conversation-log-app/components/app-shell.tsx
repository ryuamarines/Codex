import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  title,
  description,
  actions,
  children
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-3xl border border-stone-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Conversation Log App
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
                  {title}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-stone-600 sm:text-base">{description}</p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              >
                一覧
              </Link>
              <Link
                href="/new"
                className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
              >
                新規登録
              </Link>
              {actions}
            </nav>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
