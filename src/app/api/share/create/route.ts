import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { conversationId } = body as { conversationId?: string };
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();

  // ログインユーザーの users.id を取得
  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("email", session.user.email)
    .single();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 403 });
  }

  // 所有権チェック
  const { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .single();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found or not owned" },
      { status: 403 },
    );
  }

  // 同一 conversation_id の share が既にあれば返す（冪等）
  const { data: existing } = await db
    .from("shares")
    .select("share_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  // リクエストのオリジンを使うことで dev/本番どちらでも正しい URL になる
  const base = new URL(req.url).origin;

  if (existing) {
    const url = `${base}/share/${existing.share_id}`;
    return NextResponse.json({ shareId: existing.share_id, url });
  }

  // 新規作成
  const shareId = nanoid(12);
  const { error } = await db.from("shares").insert({
    share_id: shareId,
    conversation_id: conversationId,
    created_by: user.id,
    visibility: "all",
    expires_at: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = `${base}/share/${shareId}`;
  return NextResponse.json({ shareId, url });
}
