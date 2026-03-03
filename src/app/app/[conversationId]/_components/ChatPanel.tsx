"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScrollAnchor } from "./ScrollAnchor";
import { ShareButton } from "./ShareButton";

// ============================================================
// Emotion system
// ============================================================

type Emotion =
  | "surprise"
  | "thinking"
  | "sad"
  | "happy"
  | "analysis"
  | "intensity"
  | "celebration"
  | "cool";

const EMOTION_IMAGES: Record<Emotion, string> = {
  surprise: "/dojo/1_surprise.png",
  thinking: "/dojo/2_thinking_a.png",
  sad: "/dojo/3_sadness.png",
  happy: "/dojo/4_happy_a.png",
  analysis: "/dojo/5_analysis.png",
  intensity: "/dojo/6_intensity.png",
  celebration: "/dojo/7_celebration.png",
  cool: "/dojo/8_cool_pose.png",
};

const VALID_EMOTIONS = Object.keys(EMOTION_IMAGES) as Emotion[];

// ============================================================
// Avatar randomization (thinking を除外した候補からメッセージID で決定的に選択)
// ============================================================

const AVATAR_CANDIDATES = [
  "/dojo/1_surprise.png",
  "/dojo/3_sadness.png",
  "/dojo/4_happy_a.png",
  "/dojo/5_analysis.png",
  "/dojo/6_intensity.png",
  "/dojo/7_celebration.png",
  "/dojo/8_cool_pose.png",
];

function pickAvatar(messageId: string): string {
  let hash = 0;
  for (let i = 0; i < messageId.length; i++) {
    hash = (hash * 31 + messageId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_CANDIDATES[hash % AVATAR_CANDIDATES.length];
}

/**
 * assistant content の先頭にある [emotion:xxx] タグをパースして除去する。
 * 例: "[emotion:surprise] 本文…" → { emotion: "surprise", text: "本文…" }
 */
function parseAssistantContent(content: string): {
  emotion: Emotion;
  text: string;
} {
  const match = content.match(/^\[emotion:(\w+)\]\s*/);
  if (match) {
    const tag = match[1] as Emotion;
    return {
      emotion: VALID_EMOTIONS.includes(tag) ? tag : "happy",
      text: content.slice(match[0].length),
    };
  }
  return { emotion: "happy", text: content };
}

// ============================================================
// Types
// ============================================================

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  /** RAG 参照元。API レスポンスから取得した場合のみ存在。DB には保存しない。 */
  citations?: string[];
};

// ============================================================
// Sub-components
// ============================================================

function UserBubble({
  content,
  createdAt,
}: {
  content: string;
  createdAt: string;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-sm text-white">{content}</p>
        <time className="mt-1 block text-right text-[11px] text-blue-100">
          {new Date(createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
    </div>
  );
}

/** 折りたたみ式の参照ソース表示 */
function CitationsPanel({ citations }: { citations: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-gray-600"
      >
        <span>{open ? "▲" : "▾"}</span>
        <span>参照を{open ? "閉じる" : "表示"}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5 pl-1">
          {citations.map((c) => (
            <li key={c} className="font-mono text-[11px] text-gray-400">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssistantBubble({
  messageId,
  content,
  createdAt,
  citations,
}: {
  messageId: string;
  content: string;
  createdAt: string;
  citations?: string[];
}) {
  const { text } = parseAssistantContent(content);
  const avatarSrc = pickAvatar(messageId);

  return (
    <div className="flex items-end gap-2.5">
      {/* アバター */}
      <div className="relative h-20 w-20 shrink-0">
        <Image
          src={avatarSrc}
          alt="道場くん"
          fill
          className="object-contain"
        />
      </div>

      {/* 吹き出し */}
      <div className="max-w-[72%] rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-sm text-gray-800">{text}</p>
        {citations && citations.length > 0 && (
          <CitationsPanel citations={citations} />
        )}
        <time className="mt-1 block text-[11px] text-gray-400">
          {new Date(createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
    </div>
  );
}

/** 道場くんが入力中を示す typing インジケータ（thinking 表情） */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <div className="relative h-14 w-14 shrink-0">
        <Image
          src="/dojo/2_thinking_a.png"
          alt="道場くんが考え中"
          fill
          className="object-contain"
        />
      </div>
      <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 160, 320].map((delay) => (
            <span
              key={delay}
              className="block h-2 w-2 animate-bounce rounded-full bg-gray-400"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main export
// ============================================================

export function ChatPanel({
  initialMessages,
  conversationId,
  title,
  category,
}: {
  initialMessages: Message[];
  conversationId: string;
  title: string;
  category?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = textareaRef.current?.value.trim();
    if (!content) return;

    setError(null);

    // オプティミスティック更新: ユーザーメッセージを即時表示
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content, created_at: now },
    ]);
    formRef.current?.reset();

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, message: content }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "AI 返答に失敗しました");
          // ロールバック: オプティミスティックに追加したメッセージを削除
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }

        const data = await res.json();

        // assistant メッセージを citations 付きでローカル state に追加
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.text,
            created_at: new Date().toISOString(),
            citations: data.citations ?? [],
          },
        ]);

        // サイドバーの updated_at を更新するためだけに refresh
        router.refresh();
      } catch {
        setError("通信エラーが発生しました。再試行してください。");
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    });
  }

  return (
    // flex-1 min-h-0: flex-col 親の中で正しく残余スペースを埋める（h-full は不使用）
    <div className="flex flex-1 min-h-0 flex-col bg-gray-50">
      {/* ── ヘッダー（Client Component 内に収める = router.refresh() の影響を受けない） ── */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900">
              {title}
            </h1>
            {category && (
              <p className="text-xs text-gray-500">{category}</p>
            )}
          </div>
          {/* 共有ボタン: Client Component 内なので router.refresh() で消えない */}
          <ShareButton conversationId={conversationId} />
        </div>
      </header>

      {/* メッセージリスト */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.length > 0 ? (
            messages.map((msg) =>
              msg.role === "user" ? (
                <UserBubble
                  key={msg.id}
                  content={msg.content}
                  createdAt={msg.created_at}
                />
              ) : (
                <AssistantBubble
                  key={msg.id}
                  messageId={msg.id}
                  content={msg.content}
                  createdAt={msg.created_at}
                  citations={msg.citations}
                />
              ),
            )
          ) : (
            <div className="py-20 text-center">
              <div className="relative mx-auto mb-4 h-24 w-24">
                <Image
                  src="/dojo/4_happy_a.png"
                  alt="道場くん"
                  fill
                  className="object-contain"
                />
              </div>
              <p className="text-sm font-medium text-gray-600">
                道場くんが待っています
              </p>
              <p className="mt-1 text-xs text-gray-400">
                商談の相談を入力してください
              </p>
            </div>
          )}

          {/* 生成中は typing インジケータを表示 */}
          {isPending && <TypingIndicator />}

          <ScrollAnchor />
        </div>
      </div>

      {/* 入力エリア */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              ⚠️ {error}
            </p>
          )}
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex items-end gap-3"
          >
            <textarea
              ref={textareaRef}
              name="content"
              rows={3}
              placeholder="Enter で改行 / Ctrl(Cmd)+Enter で送信"
              disabled={isPending}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
                // Enter 単体・Shift+Enter はデフォルト動作（改行）
              }}
            />
            <button
              type="submit"
              disabled={isPending}
              className="shrink-0 cursor-pointer rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "生成中…" : "送信"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
