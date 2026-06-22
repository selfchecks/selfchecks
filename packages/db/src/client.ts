import { PrismaClient } from "@prisma/client";

export type PrismaClientCache<TClient> = {
  selfchecksPrisma?: TClient;
};

export type GetPrismaClientOptions<TClient> = {
  cache?: PrismaClientCache<TClient>;
  createClient?: () => TClient;
  nodeEnv?: string;
};

export function getPrismaClient<TClient = PrismaClient>({
  cache = globalThis as unknown as PrismaClientCache<TClient>,
  createClient = () => new PrismaClient() as TClient,
  nodeEnv = process.env.NODE_ENV,
}: GetPrismaClientOptions<TClient> = {}): TClient {
  const client = cache.selfchecksPrisma ?? createClient();

  if (nodeEnv !== "production") {
    cache.selfchecksPrisma = client;
  }

  return client;
}
