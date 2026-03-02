"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useState } from "react";
import { NewConversationForm } from "./NewConversationForm";
import { handleSignOut } from "../actions";

type Conversation = {
  id: string;
  title: string;
  category: string | null;
  updated_at: string;
};

export function Sidebar({
  conversations,
  userName,
  chatModel,
}: {
  conversations: Conversation[];
  userName: string;
  chatModel: string;
}) {
  // /app/[conversationId] のとき conversationId が返る、/app のとき null
  const activeId = useSelectedLayoutSegment();
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* ヘッダー */}
      <div className="border-b border-gray-100 px-4 py-4">
        <h1 className="text-base font-bold text-gray-900">いつでも道場くん</h1>
        <p className="mt-0.5 truncate text-xs text-gray-500">{userName}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">
          使用中モデル: {chatModel}
        </p>
      </div>

      {/* 検索 */}
      <div className="px-3 pt-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="スレッドを検索…"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 新規スレッドボタン */}
      <div className="px-3 py-2">
        <NewConversationForm compact />
      </div>

      {/* スレッド一覧 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length > 0 ? (
          <ul className="space-y-0.5">
            {filtered.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <li key={conv.id}>
                  <Link
                    href={`/app/${conv.id}`}
                    className={`block rounded-lg px-3 py-2.5 transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-900"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <p className="truncate text-sm font-medium leading-snug">
                      {conv.title}
                    </p>
                    {conv.category && (
                      <p
                        className={`mt-0.5 truncate text-xs ${isActive ? "text-blue-500" : "text-gray-400"}`}
                      >
                        {conv.category}
                      </p>
                    )}
                    <time
                      className={`mt-0.5 block text-xs ${isActive ? "text-blue-400" : "text-gray-400"}`}
                    >
                      {formatRelativeDate(conv.updated_at)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-gray-400">
            {search ? "一致するスレッドがありません" : "まだ会話がありません"}
          </p>
        )}
      </nav>

      {/* サインアウト */}
      <div className="border-t border-gray-100 p-3">
        <form action={handleSignOut}>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            サインアウト
          </button>
        </form>
      </div>
    </aside>
  );
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = diff / 3_600_000;
  if (h < 1) return "たった今";
  if (h < 24) return `${Math.floor(h)}時間前`;
  if (h < 24 * 7) return `${Math.floor(h / 24)}日前`;
  return new Date(dateStr).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
}
