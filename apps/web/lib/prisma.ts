import { PrismaClient } from "@prisma/client";

type PrismaCache = {
  selfchecksWebPrisma?: PrismaClient;
};

const cache = globalThis as unknown as PrismaCache;

export const prisma =
  cache.selfchecksWebPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  cache.selfchecksWebPrisma = prisma;
}
