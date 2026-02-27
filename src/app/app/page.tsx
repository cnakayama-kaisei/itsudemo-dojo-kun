import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="text-3xl font-bold">いつでも道場くん</h1>
      <div className="text-center">
        <p className="text-gray-600">
          ようこそ、
          <span className="font-semibold">{session.user.name}</span> さん
        </p>
        <p className="text-sm text-gray-400">{session.user.email}</p>
      </div>
      <form action={handleSignOut}>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
        >
          サインアウト
        </button>
      </form>
    </main>
  );
}
