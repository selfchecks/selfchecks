import { getPrismaClient } from "./client.js";

export const prisma = getPrismaClient();

export * from "@prisma/client";
export { getPrismaClient };
