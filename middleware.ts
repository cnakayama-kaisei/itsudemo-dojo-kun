export { auth as default } from "@/auth";

export const config = {
  // /app・/admin・/share 配下を保護（未ログインは /login にリダイレクト）
  matcher: ["/app/:path*", "/admin/:path*", "/share/:path*"],
};
