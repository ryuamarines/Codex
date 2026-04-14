"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LogForm } from "@/components/log-form";
import type { ConversationLog } from "@/lib/log-types";
import { getLogById, replaceLog } from "@/lib/log-repository";
import { toFormInput, updateLogEntry } from "@/lib/log-utils";

export function LogEditPage({ id }: { id: string }) {
  const router = useRouter();
  const [entry, setEntry] = useState<ConversationLog | null | undefined>(undefined);

  useEffect(() => {
    setEntry(getLogById(id) ?? null);
  }, [id]);

  if (entry === undefined) {
    return (
      <AppShell title="編集" description="編集対象のログを読み込んでいます。">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 text-stone-500 shadow-sm">
          読み込み中...
        </div>
      </AppShell>
    );
  }

  if (entry === null) {
    return (
      <AppShell title="編集" description="指定されたログが見つかりません。">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-stone-500 shadow-sm">
          編集対象のログが存在しません。
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="編集" description="既存ログを修正して保存します。">
      <LogForm
        initialValue={toFormInput(entry)}
        submitLabel="更新する"
        onSubmit={(value) => {
          const updated = updateLogEntry(entry, value);
          replaceLog(updated);
          router.push(`/logs/${updated.id}`);
        }}
      />
    </AppShell>
  );
}
