import { LoginForm } from "@/app/(auth)/login/_components/login-form";

export default async function McpLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, item);
  }
  return (
    <main className="mx-auto max-w-sm space-y-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">
        Connect your assistant to Harly
      </h1>
      <p className="text-sm text-muted-foreground">
        Sign in with your existing staff account to continue.
      </p>
      <LoginForm redirect={`/api/auth/oauth2/authorize?${query}`} />
    </main>
  );
}
