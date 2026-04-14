"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type { ConversationLog } from "@/lib/log-types";
import { getLogById } from "@/lib/log-repository";
import { formatDate } from "@/lib/log-utils";

export function LogDetailPage({ id }: { id: string }) {
  const [entry, setEntry] = useState<ConversationLog | null | undefined>(undefined);

  useEffect(() => {
    setEntry(getLogById(id) ?? null);
  }, [id]);

  if (entry === undefined) {
    return (
      <AppShell title="詳細" description="保存済みログを読み込んでいます。">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 text-stone-500 shadow-sm">
          読み込み中...
        </div>
      </AppShell>
    );
  }

  if (entry === null) {
    return (
      <AppShell title="詳細" description="指定されたログが見つかりません。">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-stone-500 shadow-sm">
          ログが存在しません。
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={entry.title}
      description="保存した本文全体と補足メモを確認できます。"
      actions={
        <Link
          href={`/logs/${entry.id}/edit`}
          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          編集
        </Link>
      }
    >
      <article className="grid gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 text-sm text-stone-600">
          <span className="rounded-full bg-stone-100 px-3 py-1">{entry.category}</span>
          <span className="rounded-full bg-stone-100 px-3 py-1">{formatDate(entry.date)}</span>
          <span className="rounded-full bg-stone-100 px-3 py-1">作成: {formatDate(entry.createdAt)}</span>
          <span className="rounded-full bg-stone-100 px-3 py-1">更新: {formatDate(entry.updatedAt)}</span>
        </div>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold text-stone-900">本文</h2>
          <div className="rounded-2xl bg-stone-50 p-5 text-sm leading-8 text-stone-700">
            <p className="whitespace-pre-wrap">{entry.content}</p>
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold text-stone-900">タグ</h2>
          <div className="flex flex-wrap gap-2">
            {entry.tags.length === 0 ? (
              <p className="text-sm text-stone-500">タグは未設定です。</p>
            ) : (
              entry.tags.map((item) => (
                <span key={item} className="rounded-full border border-stone-200 px-3 py-1 text-sm text-stone-600">
                  #{item}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold text-stone-900">メモ</h2>
          <div className="rounded-2xl bg-stone-50 p-5 text-sm leading-8 text-stone-700">
            <p className="whitespace-pre-wrap">{entry.note || "メモは未入力です。"}</p>
          </div>
        </section>
      </article>
    </AppShell>
  );
}
