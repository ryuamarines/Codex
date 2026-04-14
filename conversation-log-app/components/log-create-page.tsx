"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LogForm } from "@/components/log-form";
import { createLog } from "@/lib/log-repository";
import { createLogEntry } from "@/lib/log-utils";

export function LogCreatePage() {
  const router = useRouter();

  return (
    <AppShell
      title="新規登録"
      description="対話ログや個人メモを 1 件ずつ登録します。タグはカンマ区切りで入力できます。"
    >
      <LogForm
        submitLabel="保存する"
        onSubmit={(value) => {
          const entry = createLogEntry(value);
          createLog(entry);
          router.push(`/logs/${entry.id}`);
        }}
      />
    </AppShell>
  );
}
