import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getChatModel } from "@/lib/openai";
import { Sidebar } from "./_components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const db = getSupabaseAdmin();

  // ログイン時に users テーブルへ upsert（全 /app/** ページで実行）
  await db
    .from("users")
    .upsert(
      {
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      },
      { onConflict: "email" },
    );

  // email → users.id
  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();

  // 自分の会話一覧（updated_at 降順）
  const { data: conversations } = user
    ? await db
        .from("conversations")
        .select("id, title, category, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
    : { data: [] };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar
        conversations={conversations ?? []}
        userName={session.user.name ?? ""}
        chatModel={getChatModel()}
      />
      {/* 右側コンテンツ */}
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
