import type { ConversationLog } from "@/lib/log-types";

const now = "2026-03-23T12:00:00.000Z";

export const sampleLogs: ConversationLog[] = [
  {
    id: "log-chatgpt-prompt-design",
    title: "プロンプト設計の試行メモ",
    date: "2026-03-21",
    category: "AIとの会話ログ",
    content:
      "ChatGPT と壁打ちしながら、要件定義の粒度とプロンプトの前提条件を整理した。目的、制約、出力形式を先に固定すると回答の再利用性が上がることを確認。",
    tags: ["ChatGPT", "プロンプト", "要件定義"],
    note: "後でテンプレート化したい。",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "log-relationship-weekly-note",
    title: "人間関係メモ: 週次の振り返り",
    date: "2026-03-18",
    category: "人間関係メモ",
    content:
      "会話の前提がずれていると認識コストが高くなる。話題ごとに期待値を揃えてから話し始めると、摩擦が減った。",
    tags: ["対話", "振り返り"],
    note: "次回は具体例も追加する。",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "log-project-idea-stock",
    title: "企画メモ: 対話ログ整理アプリの方向性",
    date: "2026-03-15",
    category: "企画メモ",
    content:
      "AI 会話ログと個人メモを横断検索できるようにする。最初は localStorage 保存で始めて、あとで SQLite や Supabase に切り替えられる境界を用意する。",
    tags: ["アプリ構想", "検索", "保存設計"],
    note: "カテゴリ定義は増やしやすく保つ。",
    createdAt: now,
    updatedAt: now
  }
];
