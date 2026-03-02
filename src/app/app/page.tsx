import Image from "next/image";
import { auth } from "@/auth";
import { ReindexButton } from "./_components/ReindexButton";

const ADMIN_EMAIL = "cnakayama@chameleon-inc.net";

/** /app（会話未選択）のウェルカム画面 */
export default async function AppPage() {
  const session = await auth();
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* 管理者のみ表示するヘッダー */}
      {isAdmin && (
        <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center justify-end">
            <ReindexButton />
          </div>
        </header>
      )}

      {/* ウェルカムコンテンツ */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="relative h-28 w-28">
          <Image
            src="/dojo/4_happy_a.png"
            alt="道場くん"
            fill
            className="object-contain"
          />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-700">
            いつでも道場くん
          </p>
          <p className="mt-1 text-sm text-gray-400">
            左のスレッドを選ぶか、新しい会話を始めましょう
          </p>
        </div>
      </div>
    </div>
  );
}
