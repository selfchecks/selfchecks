import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import {
  readRuntimeConfig,
  verifyAdminPassword,
  type RuntimeConfigEnv,
} from "@/lib/runtime-config";

export type AdminCredentials = {
  login?: string;
  password?: string;
};

export type AdminAuthEnv = {
  [key: string]: string | undefined;
  SELFCHECKS_ADMIN_LOGIN?: string;
  SELFCHECKS_ADMIN_PASSWORD?: string;
} & RuntimeConfigEnv;

export function authorizeAdminCredentials(
  credentials: AdminCredentials | undefined,
  env: AdminAuthEnv = process.env,
) {
  const runtimeConfig = readRuntimeConfig(env);

  if (runtimeConfig.admin) {
    if (
      credentials?.login === runtimeConfig.admin.login &&
      credentials?.password &&
      verifyAdminPassword(credentials.password, runtimeConfig.admin)
    ) {
      return {
        id: "admin",
        name: runtimeConfig.admin.login,
      };
    }

    return null;
  }

  const expectedLogin = env.SELFCHECKS_ADMIN_LOGIN;
  const expectedPassword = env.SELFCHECKS_ADMIN_PASSWORD;

  if (!expectedLogin || !expectedPassword) {
    return null;
  }

  if (
    credentials?.login === expectedLogin &&
    credentials?.password === expectedPassword
  ) {
    return {
      id: "admin",
      name: expectedLogin,
    };
  }

  return null;
}

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      name: "Login and password",
      async authorize(credentials) {
        return authorizeAdminCredentials(credentials);
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
};
