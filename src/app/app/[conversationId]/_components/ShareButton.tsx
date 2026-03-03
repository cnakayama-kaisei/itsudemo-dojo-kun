"use client";

import { useRef, useState } from "react";

type UIState =
  | { mode: "idle" }
  | { mode: "pending" }
  | { mode: "success"; url: string }
  | { mode: "modal"; url: string }
  | { mode: "error"; status: number | null; message: string };

export function ShareButton({ conversationId }: { conversationId: string }) {
  const [ui, setUi] = useState<UIState>({ mode: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  // useTransition は使わず useState で pending を管理する。
  // Vercel 本番で useTransition の isPending が更新されない現象を回避するため。
  async function handleShare() {
    if (ui.mode === "pending") return;
    setUi({ mode: "pending" });

    let res: Response;
    let data: { shareId?: string; url?: string; error?: string };

    // ---- fetch ----
    try {
      res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Vercel 本番でも Cookie を確実に送る
        body: JSON.stringify({ conversationId }),
      });
    } catch (err) {
      // ネットワーク到達不能・CORS プリフライト失敗など
      setUi({
        mode: "error",
        status: null,
        message: `ネットワークエラー: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // ---- レスポンスボディ ----
    try {
      data = await res.json();
    } catch {
      // JSON でないレスポンス（Vercel の HTML エラーページ等）
      setUi({
        mode: "error",
        status: res.status,
        message: `${res.status} ${res.statusText} (レスポンスが JSON ではありません)`,
      });
      return;
    }

    // ---- API エラー ----
    if (!res.ok) {
      setUi({
        mode: "error",
        status: res.status,
        message: `${res.status} ${data.error ?? res.statusText ?? "エラーが発生しました"}`,
      });
      return;
    }

    const url = data.url ?? "";

    // ---- クリップボード ----
    try {
      await navigator.clipboard.writeText(url);
      setUi({ mode: "success", url });
      setTimeout(() => setUi({ mode: "idle" }), 4000);
    } catch {
      // clipboard API が使えない環境（非 HTTPS、権限拒否）→ モーダルで手動コピー
      setUi({ mode: "modal", url });
    }
  }

  function handleSelectAll() {
    inputRef.current?.select();
  }

  async function handleCopyFromModal() {
    if (ui.mode !== "modal") return;
    try {
      await navigator.clipboard.writeText(ui.url);
      setUi({ mode: "success", url: ui.url });
      setTimeout(() => setUi({ mode: "idle" }), 4000);
    } catch {
      inputRef.current?.select();
    }
  }

  const isPending = ui.mode === "pending";

  return (
    <>
      <div className="relative">
        <button
          onClick={handleShare}
          disabled={isPending}
          className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "共有中..." : "共有"}
        </button>

        {/* 成功トースト */}
        {ui.mode === "success" && (
          <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm shadow-lg">
            <p className="font-medium text-green-800">URLをコピーしました</p>
            <p className="mt-1 break-all font-mono text-xs text-green-600">
              {ui.url}
            </p>
            <button
              onClick={() => setUi({ mode: "idle" })}
              className="mt-2 text-xs text-green-700 underline opacity-70 hover:opacity-100"
            >
              閉じる
            </button>
          </div>
        )}

        {/* エラートースト（HTTPステータス付き） */}
        {ui.mode === "error" && (
          <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm shadow-lg">
            <p className="font-semibold text-red-700">共有に失敗しました</p>
            <p className="mt-1 font-mono text-xs text-red-600">{ui.message}</p>
            <button
              onClick={() => setUi({ mode: "idle" })}
              className="mt-2 text-xs text-red-700 underline opacity-70 hover:opacity-100"
            >
              閉じる
            </button>
          </div>
        )}
      </div>

      {/* 手動コピーモーダル（clipboard API が使えない場合） */}
      {ui.mode === "modal" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUi({ mode: "idle" });
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">共有URL</h2>
            <p className="mt-1 text-xs text-gray-500">
              以下のURLをコピーして共有してください
            </p>

            <div className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                readOnly
                value={ui.url}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleSelectAll}
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50"
              >
                全選択
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setUi({ mode: "idle" })}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
              >
                閉じる
              </button>
              <button
                onClick={handleCopyFromModal}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                コピー
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
