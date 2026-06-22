import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground">
        <div className="mb-6">
          <p className="text-sm font-medium text-primary">selfchecks</p>
          <h1 className="mt-2 text-xl font-semibold tracking-normal">Sign in</h1>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
