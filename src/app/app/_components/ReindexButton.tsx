"use client";

import { useState } from "react";

type IndexResult = {
  files: number;
  chunks: number;
};

type Status = "idle" | "loading" | "success" | "error";

export function ReindexButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<IndexResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/knowledge/index", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? `エラー (${res.status})`);
        setStatus("error");
        return;
      }

      setResult({ files: data.files, chunks: data.chunks });
      setStatus("success");
    } catch {
      setErrorMsg("通信エラーが発生しました");
      setStatus("error");
    }
  }

  return (
    <div className="flex items-center gap-3">
      {status === "success" && result && (
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
          ✓ {result.files}ファイル・{result.chunks}チャンク登録済み
        </span>
      )}
      {status === "error" && errorMsg && (
        <span className="text-xs text-red-600">⚠ {errorMsg}</span>
      )}
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? "実行中..." : "再インデックス"}
      </button>
    </div>
  );
}
