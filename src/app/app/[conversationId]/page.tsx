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

  // ヘッダー（タイトル・共有ボタン）は ChatPanel（Client Component）内に持つ。
  // Server Component のヘッダーに置くと router.refresh() のたびに
  // RSC 調停で ShareButton が remount されてボタンが消える問題が起きるため。
  return (
    <ChatPanel
      initialMessages={messages ?? []}
      conversationId={conversationId}
      title={conversation.title}
      category={conversation.category ?? undefined}
    />
  );
}
