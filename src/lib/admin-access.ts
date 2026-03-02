/**
 * 管理画面アクセス判定の共有ロジック。
 * page.tsx / actions.ts の両方からインポートして使う。
 *
 * 判定ルール（OR）:
 *   1. users.role が 'manager' または 'admin'  ← メイン判定
 *   2. ADMIN_ALLOW_EMAILS に含まれるメール    ← 緊急ルート（初回bootstrap等）
 *
 * 将来 role 判定だけに絞る場合は getAllowedEmails() 行を削除する。
 */

function getAllowedEmails(): Set<string> {
  const raw = process.env.ADMIN_ALLOW_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function hasAdminAccess(email: string, role: string): boolean {
  // メイン: role ベース
  if (role === "manager" || role === "admin") return true;
  // 緊急ルート: 環境変数許可リスト
  return getAllowedEmails().has(email.trim().toLowerCase());
}
