import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasAdminAccess } from "@/lib/admin-access";
import { UserRoleSelect } from "./_components/UserRoleSelect";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function roleBadgeClass(role: string): string {
  if (role === "admin") return "bg-purple-100 text-purple-700";
  if (role === "manager") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

// ============================================================
// Page（Server Component）
// ============================================================

export default async function AdminPage() {
  // --- 認証 ---
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const db = getSupabaseAdmin();

  const { data: currentUser } = await db
    .from("users")
    .select("id, email, name, role")
    .eq("email", session.user.email)
    .single();

  // role ベース OR 緊急ルート（ADMIN_ALLOW_EMAILS）で判定
  if (!currentUser || !hasAdminAccess(currentUser.email, currentUser.role)) {
    redirect("/app");
  }

  // --- データ取得（並列） ---
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: allUsers },
    { data: allConvs },
    { data: allUserMsgs },
    { data: convsWithCat },
    { data: recentConvs },
  ] = await Promise.all([
    // created_at を追加（ユーザー管理テーブルで表示）
    db
      .from("users")
      .select("id, email, name, role, created_at")
      .order("created_at", { ascending: true }),
    db.from("conversations").select("id, user_id"),
    db
      .from("messages")
      .select("conversation_id, created_at")
      .eq("role", "user"),
    db
      .from("conversations")
      .select("category")
      .not("category", "is", null)
      .neq("category", ""),
    db
      .from("conversations")
      .select("id, title, category, updated_at, user_id")
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  // --- 利用頻度集計 ---
  const convUserMap = new Map<string, string>();
  for (const c of allConvs ?? []) convUserMap.set(c.id, c.user_id);

  type UserStat = {
    convs: number;
    msgs: number;
    msgs7d: number;
    msgs30d: number;
  };
  const statsMap = new Map<string, UserStat>();
  for (const u of allUsers ?? []) {
    statsMap.set(u.id, { convs: 0, msgs: 0, msgs7d: 0, msgs30d: 0 });
  }
  for (const c of allConvs ?? []) {
    const s = statsMap.get(c.user_id);
    if (s) s.convs++;
  }
  for (const m of allUserMsgs ?? []) {
    const userId = convUserMap.get(m.conversation_id);
    if (!userId) continue;
    const s = statsMap.get(userId);
    if (!s) continue;
    s.msgs++;
    if (m.created_at >= cutoff7d) s.msgs7d++;
    if (m.created_at >= cutoff30d) s.msgs30d++;
  }

  const userRows = (allUsers ?? [])
    .map((u) => ({
      ...u,
      stat: statsMap.get(u.id) ?? { convs: 0, msgs: 0, msgs7d: 0, msgs30d: 0 },
    }))
    .sort((a, b) => b.stat.msgs7d - a.stat.msgs7d);

  // --- カテゴリ集計 ---
  const catCount = new Map<string, number>();
  for (const c of convsWithCat ?? []) {
    if (!c.category) continue;
    catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
  }
  const topCategories = [...catCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // --- 最近の相談用 userId → email ---
  const userEmailMap = new Map((allUsers ?? []).map((u) => [u.id, u.email]));

  // --- サマリー集計 ---
  const totalUsers = allUsers?.length ?? 0;
  const totalConvs = allConvs?.length ?? 0;
  const total7dMsgs = userRows.reduce((sum, u) => sum + u.stat.msgs7d, 0);
  const total30dMsgs = userRows.reduce((sum, u) => sum + u.stat.msgs30d, 0);

  const summaryCards = [
    { label: "総ユーザー数", value: totalUsers, unit: "人" },
    { label: "総スレッド数", value: totalConvs, unit: "件" },
    { label: "直近7日メッセージ", value: total7dMsgs, unit: "件" },
    { label: "直近30日メッセージ", value: total30dMsgs, unit: "件" },
  ] as const;

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ====================================================
       * Header
       * ==================================================== */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              管理ダッシュボード
            </h1>
            <p className="text-[11px] text-gray-400">いつでも道場くん</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">
                {currentUser.name ?? currentUser.email}
              </p>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(currentUser.role)}`}
              >
                {currentUser.role}
              </span>
            </div>
            <Link
              href="/app"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              ← アプリに戻る
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* ====================================================
         * サマリーカード（4枚）
         * ==================================================== */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map(({ label, value, unit }) => (
            <div
              key={label}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                {value.toLocaleString("ja-JP")}
                <span className="ml-1 text-sm font-normal text-gray-400">
                  {unit}
                </span>
              </p>
            </div>
          ))}
        </div>

        {/* ====================================================
         * ユーザー管理
         * ==================================================== */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            ユーザー管理
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                  <th className="px-5 py-3 text-left">ユーザー</th>
                  <th className="px-5 py-3 text-left">role</th>
                  <th className="px-5 py-3 text-left">登録日</th>
                </tr>
              </thead>
              <tbody>
                {(allUsers ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-5 py-10 text-center text-sm text-gray-400"
                    >
                      ユーザーなし
                    </td>
                  </tr>
                ) : (
                  (allUsers ?? []).map((u, i) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr
                        key={u.id}
                        className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-gray-50 ${
                          i % 2 === 1 ? "bg-gray-50/60" : "bg-white"
                        }`}
                      >
                        {/* ユーザー情報 */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-gray-800">
                                {u.name ?? "—"}
                              </p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                            {isSelf && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                自分
                              </span>
                            )}
                          </div>
                        </td>

                        {/* role 変更ドロップダウン */}
                        <td className="px-5 py-3">
                          <UserRoleSelect
                            userId={u.id}
                            currentRole={u.role}
                            isSelf={isSelf}
                          />
                        </td>

                        {/* 登録日 */}
                        <td className="px-5 py-3 text-xs tabular-nums text-gray-400">
                          {formatDateShort(u.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            role を変更すると即時反映されます。自分自身を member に降格させることはできません。
          </p>
        </section>

        {/* ====================================================
         * 利用頻度（ユーザー別）
         * ==================================================== */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            利用頻度（ユーザー別）
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                  <th className="px-5 py-3 text-left">ユーザー</th>
                  <th className="px-5 py-3 text-right">総スレッド</th>
                  <th className="px-5 py-3 text-right">総メッセージ</th>
                  <th className="px-5 py-3 text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      直近7日
                      <span className="text-blue-500">▼</span>
                    </span>
                  </th>
                  <th className="px-5 py-3 text-right">直近30日</th>
                </tr>
              </thead>
              <tbody>
                {userRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-gray-400"
                    >
                      ユーザーなし
                    </td>
                  </tr>
                ) : (
                  userRows.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`border-b border-gray-100 last:border-0 transition-colors hover:bg-blue-50/40 ${
                        i % 2 === 1 ? "bg-gray-50/60" : "bg-white"
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800">
                          {u.name ?? "—"}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">
                        {u.stat.convs}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">
                        {u.stat.msgs}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-gray-900">
                        {u.stat.msgs7d}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">
                        {u.stat.msgs30d}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ====================================================
         * 相談カテゴリ + 最近の相談（2カラム）
         * ==================================================== */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
          {/* 相談カテゴリ */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              相談カテゴリ（上位10件）
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              {topCategories.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-gray-400">
                  カテゴリ付きの相談はまだありません
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {topCategories.map(([cat, count], i) => {
                    const max = topCategories[0][1];
                    const pct = Math.round((count / max) * 100);
                    return (
                      <li key={cat} className="px-5 py-3.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
                              {i + 1}
                            </span>
                            <span className="truncate text-sm text-gray-800">
                              {cat}
                            </span>
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            {count}件
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100">
                          <div
                            className="h-1.5 rounded-full bg-blue-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* 最近の相談 */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              最近の相談（最新10件）
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              {(recentConvs ?? []).length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-gray-400">
                  相談なし
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {(recentConvs ?? []).map((conv) => (
                    <li
                      key={conv.id}
                      className="px-5 py-3.5 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/app/${conv.id}`}
                            className="block truncate text-sm font-medium text-blue-600 hover:underline"
                          >
                            {conv.title}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-gray-400">
                            {userEmailMap.get(conv.user_id) ?? "—"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {conv.category ? (
                            <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {conv.category}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                          <p className="mt-1 text-[11px] tabular-nums text-gray-400">
                            {formatDate(conv.updated_at)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
