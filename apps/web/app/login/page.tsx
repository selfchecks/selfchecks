import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { ServiceMark } from "@/components/service-mark";
import { hasAdminEnvCredentials } from "@/lib/auth";
import { isSetupRequired } from "@/lib/runtime-config";

export default function LoginPage() {
  if (isSetupRequired() && !hasAdminEnvCredentials()) {
    redirect("/setup");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground">
        <div className="mb-6 flex items-center gap-3">
          <ServiceMark className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">SelfChecks</p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">Sign in</h1>
          </div>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
