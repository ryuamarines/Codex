"use client";

import { useState } from "react";
import type { ConversationLogInput } from "@/lib/log-types";

const emptyInput: ConversationLogInput = {
  title: "",
  date: "",
  category: "",
  content: "",
  tagsText: "",
  note: ""
};

export function LogForm({
  initialValue,
  submitLabel,
  onSubmit
}: {
  initialValue?: ConversationLogInput;
  submitLabel: string;
  onSubmit: (value: ConversationLogInput) => void;
}) {
  const [form, setForm] = useState<ConversationLogInput>(initialValue ?? emptyInput);

  function update<K extends keyof ConversationLogInput>(key: K, value: ConversationLogInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="grid gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="タイトル" required>
          <input
            required
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="例: プロンプト改善メモ"
            className="input"
          />
        </FormField>
        <FormField label="日付" required>
          <input
            required
            type="date"
            value={form.date}
            onChange={(event) => update("date", event.target.value)}
            className="input"
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="分類カテゴリ" required>
          <input
            required
            value={form.category}
            onChange={(event) => update("category", event.target.value)}
            placeholder="例: AIとの会話ログ"
            className="input"
          />
        </FormField>
        <FormField label="タグ">
          <input
            value={form.tagsText}
            onChange={(event) => update("tagsText", event.target.value)}
            placeholder="例: ChatGPT, 要件定義, 企画"
            className="input"
          />
        </FormField>
      </div>

      <FormField label="本文" required>
        <textarea
          required
          value={form.content}
          onChange={(event) => update("content", event.target.value)}
          placeholder="会話ログやメモの本文を入力"
          className="input min-h-64 resize-y"
        />
      </FormField>

      <FormField label="メモ">
        <textarea
          value={form.note}
          onChange={(event) => update("note", event.target.value)}
          placeholder="補足や今後のアクション"
          className="input min-h-28 resize-y"
        />
      </FormField>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-stone-700">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
