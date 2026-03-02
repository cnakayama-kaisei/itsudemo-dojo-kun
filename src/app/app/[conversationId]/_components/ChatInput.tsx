"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ChatInput({ conversationId }: { conversationId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = textareaRef.current?.value.trim();
    if (!content) return;

    setError(null);

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
          return;
        }

        formRef.current?.reset();
        router.refresh(); // Server Component を再フェッチして新着メッセージを表示
      } catch {
        setError("通信エラーが発生しました。再試行してください。");
      }
    });
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {/* エラー表示 */}
      {error && (
        <div className="mx-auto mb-2 max-w-2xl">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            ⚠️ {error}
          </p>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-2xl items-end gap-2"
      >
        <textarea
          ref={textareaRef}
          name="content"
          rows={2}
          placeholder="Enter で改行 / Ctrl(Cmd)+Enter で送信"
          disabled={isPending}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              // Ctrl+Enter（Windows/Linux）または Cmd+Enter（Mac）で送信
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
            // Enter 単体・Shift+Enter はデフォルト動作（改行）のまま
          }}
        />
        <button
          type="submit"
          disabled={isPending}
          className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "AI 生成中…" : "送信"}
        </button>
      </form>
    </div>
  );
}
