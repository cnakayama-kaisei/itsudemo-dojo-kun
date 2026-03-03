import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** [emotion:xxx] プレフィックスを除去して本文だけ返す */
function parseContent(content: string): string {
  return content.replace(/^\[emotion:\w+\]\s*/, "");
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;

  // ログイン必須
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const db = getSupabaseAdmin();

  // share を share_id で引く
  const { data: share } = await db
    .from("shares")
    .select("conversation_id, visibility, expires_at")
    .eq("share_id", shareId)
    .single();

  if (!share) notFound();

  // 期限チェック
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-2xl">⏰</p>
          <p className="mt-2 text-sm text-gray-600">この共有リンクは期限切れです</p>
        </div>
      </div>
    );
  }

  // visibility チェック（MVP: all のみ対応）
  if (share.visibility !== "all") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-2xl">🔒</p>
          <p className="mt-2 text-sm text-gray-600">権限がありません</p>
        </div>
      </div>
    );
  }

  // 会話取得
  const { data: conversation } = await db
    .from("conversations")
    .select("title, category")
    .eq("id", share.conversation_id)
    .single();

  if (!conversation) notFound();

  // メッセージ（時系列昇順）
  const { data: messages } = await db
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", share.conversation_id)
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              共有
            </span>
            <h1 className="text-base font-semibold text-gray-900">
              {conversation.title}
            </h1>
          </div>
          {conversation.category && (
            <p className="mt-0.5 text-xs text-gray-500">{conversation.category}</p>
          )}
        </div>
      </header>

      {/* メッセージ一覧（読み取り専用） */}
      <div className="mx-auto max-w-2xl px-6 py-6">
        {(messages ?? []).length === 0 ? (
          <p className="py-20 text-center text-sm text-gray-400">
            メッセージがありません
          </p>
        ) : (
          <div className="space-y-5">
            {(messages ?? []).map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[72%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-3 shadow-sm">
                    <p className="whitespace-pre-wrap text-sm text-white">
                      {msg.content}
                    </p>
                    <time className="mt-1 block text-right text-[11px] text-blue-100">
                      {new Date(msg.created_at).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex items-end gap-2.5">
                  <div className="relative h-20 w-20 shrink-0">
                    <Image
                      src="/dojo/4_happy_a.png"
                      alt="道場くん"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="max-w-[72%] rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <p className="whitespace-pre-wrap text-sm text-gray-800">
                      {parseContent(msg.content)}
                    </p>
                    <time className="mt-1 block text-[11px] text-gray-400">
                      {new Date(msg.created_at).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
