"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type { ConversationLog } from "@/lib/log-types";
import { getAllLogs } from "@/lib/log-repository";
import { collectCategories, collectTags, formatDate, matchesFilters } from "@/lib/log-utils";

export function LogListPage() {
  const [entries, setEntries] = useState<ConversationLog[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");

  useEffect(() => {
    setEntries(getAllLogs());
  }, []);

  const categories = useMemo(() => collectCategories(entries), [entries]);
  const tags = useMemo(() => collectTags(entries), [entries]);
  const filtered = useMemo(
    () => entries.filter((entry) => matchesFilters(entry, { query, category, tag })),
    [entries, query, category, tag]
  );

  return (
    <AppShell
      title="対話ログ整理"
      description="ChatGPT との会話ログや個人メモを、検索・分類・再利用しやすい形で蓄積するためのローカルアプリです。"
    >
      <section className="mb-6 grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">キーワード検索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="タイトル、本文、タグ、メモを検索"
            className="input"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">カテゴリ絞り込み</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="input">
            <option value="">すべて</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">タグ絞り込み</span>
          <select value={tag} onChange={(event) => setTag(event.target.value)} className="input">
            <option value="">すべて</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="総件数" value={`${entries.length}`} />
        <SummaryCard label="表示件数" value={`${filtered.length}`} />
        <SummaryCard label="カテゴリ数" value={`${categories.length}`} />
      </section>

      <section className="grid gap-4">
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500 shadow-sm">
            条件に一致するログがありません。
          </div>
        ) : (
          filtered.map((entry) => (
            <article
              key={entry.id}
              className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs font-medium text-stone-600">
                    <span className="rounded-full bg-stone-100 px-3 py-1">{entry.category}</span>
                    <span className="rounded-full bg-stone-100 px-3 py-1">{formatDate(entry.date)}</span>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold tracking-tight text-stone-950">{entry.title}</h2>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                      {entry.content}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {entry.tags.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600"
                      >
                        #{item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-3">
                  <Link
                    href={`/logs/${entry.id}`}
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  >
                    詳細
                  </Link>
                  <Link
                    href={`/logs/${entry.id}/edit`}
                    className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
                  >
                    編集
                  </Link>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="mb-2 text-sm font-medium text-stone-500">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-stone-950">{value}</p>
    </div>
  );
}
