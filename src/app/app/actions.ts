"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * ログイン中ユーザーの DB users.id を取得（共通処理）
 * users テーブルに存在しない場合は upsert してから返す
 */
async function getAuthenticatedUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");

  const db = getSupabaseAdmin();

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

  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();

  if (error || !data) throw new Error("User not found in DB");
  return data.id;
}

/** 会話スレッドを新規作成してチャット画面にリダイレクト */
export async function createConversation(formData: FormData) {
  const userId = await getAuthenticatedUserId();
  const db = getSupabaseAdmin();

  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || null;
  if (!title) throw new Error("Title is required");

  const { data: conv, error } = await db
    .from("conversations")
    .insert({ user_id: userId, title, category })
    .select("id")
    .single();

  if (error || !conv)
    throw new Error(`Failed to create conversation: ${error?.message}`);

  await db.from("analytics_events").insert({
    user_id: userId,
    event_type: "create_conversation",
    meta: { conversation_id: conv.id, title },
  });

  redirect(`/app/${conv.id}`);
}

/** サインアウト → /login にリダイレクト */
export async function handleSignOut() {
  await signOut({ redirectTo: "/login" });
}
