export type SelfchecksConfig = {
  checks?: Record<string, unknown>;
  cli?: Record<string, unknown>;
  logicalId?: string;
  projectName?: string;
  repoUrl?: string;
  [key: string]: unknown;
};

export function defineConfig<const T extends SelfchecksConfig>(config: T): T {
  return config;
}
