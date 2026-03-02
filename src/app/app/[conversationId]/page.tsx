import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ChatPanel } from "./_components/ChatPanel";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const db = getSupabaseAdmin();

  // email → users.id
  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();

  if (!user) redirect("/login");

  // 会話取得（user_id で所有権確認）
  const { data: conversation } = await db
    .from("conversations")
    .select("id, title, category")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .single();

  if (!conversation) notFound();

  // メッセージ（時系列昇順）
  const { data: messages } = await db
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (
    <div className="flex h-full flex-col">
      {/* ヘッダー */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900">
              {conversation.title}
            </h1>
            {conversation.category && (
              <p className="text-xs text-gray-500">{conversation.category}</p>
            )}
          </div>
          {/* 共有ボタン（ダミー）*/}
          <button className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50">
            共有
          </button>
        </div>
      </header>

      {/* チャットパネル（メッセージ + 入力欄） */}
      <ChatPanel
        initialMessages={messages ?? []}
        conversationId={conversationId}
      />
    </div>
  );
}
