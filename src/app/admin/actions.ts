"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasAdminAccess } from "@/lib/admin-access";

const VALID_ROLES = ["member", "manager", "admin"] as const;
type Role = (typeof VALID_ROLES)[number];

/**
 * 対象ユーザーの role を更新する Server Action。
 *
 * 安全装置:
 *   - 操作者自身の権限チェック（role or 緊急ルート）
 *   - 自分自身を member に降格することを禁止
 *   - 無効な role 値はリジェクト
 */
export async function updateUserRole(
  targetUserId: string,
  newRole: string,
): Promise<{ error?: string }> {
  // 認証確認
  const session = await auth();
  if (!session?.user?.email) return { error: "Unauthorized" };

  // 有効な role かチェック
  if (!(VALID_ROLES as readonly string[]).includes(newRole)) {
    return { error: "無効な role です" };
  }

  const db = getSupabaseAdmin();

  // 操作者を取得して権限確認
  const { data: requester } = await db
    .from("users")
    .select("id, email, role")
    .eq("email", session.user.email)
    .single();

  if (!requester || !hasAdminAccess(requester.email, requester.role)) {
    return { error: "権限がありません" };
  }

  // 自分自身を member に降格することは禁止（最後の管理者が消えないように）
  if (requester.id === targetUserId && (newRole as Role) === "member") {
    return { error: "自分自身の role を member に変更することはできません" };
  }

  // DB 更新
  const { error } = await db
    .from("users")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}
