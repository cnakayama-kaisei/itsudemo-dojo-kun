"use client";

import { useState, useTransition } from "react";
import { updateUserRole } from "../actions";

const ROLES = ["member", "manager", "admin"] as const;
type Role = (typeof ROLES)[number];

const ROLE_STYLE: Record<Role, string> = {
  member: "border-gray-200 bg-gray-50 text-gray-700",
  manager: "border-blue-200 bg-blue-50 text-blue-800",
  admin: "border-purple-200 bg-purple-50 text-purple-800",
};

export function UserRoleSelect({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: string;
  isSelf: boolean;
}) {
  const [role, setRole] = useState<Role>(
    ROLES.includes(currentRole as Role) ? (currentRole as Role) : "member",
  );
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as Role;

    // 自分自身の降格を UI 側でもブロック
    if (isSelf && newRole === "member") {
      alert("自分自身の role を member に変更することはできません。");
      // select を元の値に戻す
      e.target.value = role;
      return;
    }

    const from = role;
    if (
      !window.confirm(
        `${isSelf ? "自分" : "このユーザー"} の role を「${from}」→「${newRole}」に変更しますか？`,
      )
    ) {
      // キャンセル時は元に戻す
      e.target.value = role;
      return;
    }

    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result?.error) {
        alert(`エラー: ${result.error}`);
        // 失敗時は元の値に戻す
        setRole(from);
      } else {
        setRole(newRole);
      }
    });
  }

  return (
    <select
      value={role}
      onChange={handleChange}
      disabled={isPending}
      className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${ROLE_STYLE[role]}`}
    >
      {ROLES.map((r) => (
        <option key={r} value={r} disabled={isSelf && r === "member"}>
          {r}
          {isSelf && r === "member" ? " (変更不可)" : ""}
        </option>
      ))}
    </select>
  );
}
