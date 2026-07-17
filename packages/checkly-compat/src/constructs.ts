export type FrequencyValue = number;

export const Frequency = {
  EVERY_10M: 10,
  EVERY_12H: 12 * 60,
  EVERY_15M: 15,
  EVERY_24H: 24 * 60,
  EVERY_2H: 2 * 60,
  EVERY_30M: 30,
  EVERY_3H: 3 * 60,
  EVERY_6H: 6 * 60,
} as const satisfies Record<string, FrequencyValue>;

export type Assertion = {
  operator: "contains" | "equals" | "isEmpty" | "isNotNull";
  source: string;
  target?: unknown;
};

type AssertionChain = {
  contains(value: unknown): Assertion;
  equals(value: unknown): Assertion;
  isEmpty(): Assertion;
  isNotNull(): Assertion;
};

function assertionChain(source: string): AssertionChain {
  return {
    contains: (target) => ({ operator: "contains", source, target }),
    equals: (target) => ({ operator: "equals", source, target }),
    isEmpty: () => ({ operator: "isEmpty", source }),
    isNotNull: () => ({ operator: "isNotNull", source }),
  };
}

export const AssertionBuilder = {
  jsonBody: (path: string) => assertionChain(`jsonBody:${path}`),
  statusCode: () => assertionChain("statusCode"),
  textBody: () => assertionChain("textBody"),
};

export type Request = {
  assertions?: Assertion[];
  body?: string;
  followRedirects?: boolean;
  headers?: Array<{ key: string; value: string }> | Record<string, string>;
  method: string;
  skipSSL?: boolean;
  url: string;
};

export type RetryStrategy = {
  baseBackoffSeconds?: number;
  maxDurationSeconds?: number;
  maxRetries?: number;
  onlyOn?: string[];
  sameRegion?: boolean;
  type: "EXPONENTIAL" | "FIXED" | "LINEAR" | "NO_RETRIES";
};

type RetryStrategyOptions = Omit<RetryStrategy, "type">;

export const RetryStrategyBuilder = {
  exponentialStrategy: (options: RetryStrategyOptions): RetryStrategy => ({
    ...options,
    type: "EXPONENTIAL",
  }),
  fixedStrategy: (options: RetryStrategyOptions): RetryStrategy => ({
    ...options,
    type: "FIXED",
  }),
  linearStrategy: (options: RetryStrategyOptions): RetryStrategy => ({
    ...options,
    type: "LINEAR",
  }),
  noRetries: (): RetryStrategy => ({ maxRetries: 0, type: "NO_RETRIES" }),
};

type SharedCheckProps = {
  activated?: boolean;
  environmentVariables?: Array<{ key: string; value: string }>;
  frequency?: FrequencyValue;
  group?: CheckGroup | CheckGroupV2;
  muted?: boolean;
  name?: string;
  retryStrategy?: RetryStrategy;
  runParallel?: boolean;
  tags?: string[];
};

export type ApiCheckProps = SharedCheckProps & {
  degradedResponseTime?: number;
  maxResponseTime?: number;
  request: Request;
};

export type BrowserCheckProps = SharedCheckProps & {
  code: {
    entrypoint: string;
  };
  shouldFail?: boolean;
};

export type CheckGroupV2Props = SharedCheckProps & {
  alertChannels?: WebhookAlertChannel[];
  alertEscalationPolicy?: AlertEscalationPolicy;
  locations?: string[];
  privateLocations?: string[];
};

class Construct<Props> {
  readonly logicalId: string;
  readonly props: Props;

  constructor(logicalId: string, props: Props) {
    this.logicalId = logicalId;
    this.props = props;
  }
}

export class ApiCheck extends Construct<ApiCheckProps> {}

export class BrowserCheck extends Construct<BrowserCheckProps> {}

export class CheckGroup extends Construct<CheckGroupV2Props> {}

export class CheckGroupV2 extends Construct<CheckGroupV2Props> {}

export type AlertEscalationPolicy = {
  amount: number;
  interval: number;
  runThreshold: number;
  type: "RUN_BASED";
};

export const AlertEscalationBuilder = {
  runBasedEscalation: (
    runThreshold: number,
    options: { amount: number; interval: number },
  ): AlertEscalationPolicy => ({
    ...options,
    runThreshold,
    type: "RUN_BASED",
  }),
};

export type WebhookAlertChannelProps = {
  method: string;
  name: string;
  sendDegraded?: boolean;
  sendFailure?: boolean;
  sendRecovery?: boolean;
  sslExpiry?: boolean;
  template?: string;
  url: URL;
};

export class WebhookAlertChannel extends Construct<WebhookAlertChannelProps> {}
