"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    const result = await signIn("credentials", {
      callbackUrl,
      login: String(formData.get("login") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });

    setIsPending(false);

    if (result?.ok) {
      router.push(callbackUrl);
      router.refresh();
      return;
    }

    setError("Invalid login or password.");
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium" htmlFor="login">
        Login
      </label>
      <input
        autoComplete="username"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="login"
        name="login"
        required
        type="text"
      />

      <label className="block text-sm font-medium" htmlFor="password">
        Password
      </label>
      <input
        autoComplete="current-password"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id="password"
        name="password"
        required
        type="password"
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
