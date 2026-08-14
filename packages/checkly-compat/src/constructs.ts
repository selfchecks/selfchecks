export type FrequencyValue = number;

export const Frequency = {
  EVERY_1H: 60,
  EVERY_1M: 1,
  EVERY_10M: 10,
  EVERY_12H: 12 * 60,
  EVERY_15M: 15,
  EVERY_24H: 24 * 60,
  EVERY_2H: 2 * 60,
  EVERY_2M: 2,
  EVERY_30M: 30,
  EVERY_3H: 3 * 60,
  EVERY_5M: 5,
  EVERY_6H: 6 * 60,
} as const satisfies Record<string, FrequencyValue>;

export type Assertion = {
  comparison:
    | "CONTAINS"
    | "EQUALS"
    | "GREATER_THAN"
    | "HAS_KEY"
    | "HAS_VALUE"
    | "IS_EMPTY"
    | "IS_NOT_NULL"
    | "IS_NULL"
    | "LESS_THAN"
    | "NOT_CONTAINS"
    | "NOT_EMPTY"
    | "NOT_EQUALS"
    | "NOT_HAS_KEY"
    | "NOT_HAS_VALUE";
  property?: string;
  source: "HEADERS" | "JSON_BODY" | "RESPONSE_TIME" | "STATUS_CODE" | "TEXT_BODY";
  target?: unknown;
};

type AssertionChain = {
  contains(value: unknown): Assertion;
  equals(value: unknown): Assertion;
  greaterThan(value: number): Assertion;
  hasKey(value: string): Assertion;
  hasValue(value: unknown): Assertion;
  isEmpty(): Assertion;
  isNotNull(): Assertion;
  isNull(): Assertion;
  lessThan(value: number): Assertion;
  notContains(value: unknown): Assertion;
  notEmpty(): Assertion;
  notEquals(value: unknown): Assertion;
  notHasKey(value: string): Assertion;
  notHasValue(value: unknown): Assertion;
};

function assertionChain(
  source: Assertion["source"],
  property?: string,
): AssertionChain {
  const assertion = (
    comparison: Assertion["comparison"],
    target?: unknown,
  ): Assertion => ({
    comparison,
    ...(property ? { property } : {}),
    source,
    ...(target !== undefined ? { target } : {}),
  });

  return {
    contains: (target) => assertion("CONTAINS", target),
    equals: (target) => assertion("EQUALS", target),
    greaterThan: (target) => assertion("GREATER_THAN", target),
    hasKey: (target) => assertion("HAS_KEY", target),
    hasValue: (target) => assertion("HAS_VALUE", target),
    isEmpty: () => assertion("IS_EMPTY"),
    isNotNull: () => assertion("IS_NOT_NULL"),
    isNull: () => assertion("IS_NULL"),
    lessThan: (target) => assertion("LESS_THAN", target),
    notContains: (target) => assertion("NOT_CONTAINS", target),
    notEmpty: () => assertion("NOT_EMPTY"),
    notEquals: (target) => assertion("NOT_EQUALS", target),
    notHasKey: (target) => assertion("NOT_HAS_KEY", target),
    notHasValue: (target) => assertion("NOT_HAS_VALUE", target),
  };
}

export const AssertionBuilder = {
  headers: (property?: string) => assertionChain("HEADERS", property),
  jsonBody: (property?: string) => assertionChain("JSON_BODY", property),
  responseTime: () => assertionChain("RESPONSE_TIME"),
  statusCode: () => assertionChain("STATUS_CODE"),
  textBody: (property?: string) => assertionChain("TEXT_BODY", property),
};

export type KeyValuePair = {
  key: string;
  locked?: boolean;
  secret?: boolean;
  value: string;
};

export type Request = {
  assertions?: Assertion[];
  basicAuth?: { password: string; username: string };
  body?: string;
  bodyType?: "FORM" | "GRAPHQL" | "JSON" | "NONE" | "RAW";
  followRedirects?: boolean;
  headers?: KeyValuePair[] | Record<string, string>;
  method: string;
  queryParameters?: KeyValuePair[] | Record<string, string>;
  skipSSL?: boolean;
  url: string;
};

export type RetryStrategy = {
  baseBackoffSeconds?: number;
  maxDurationSeconds?: number;
  maxRetries?: number;
  onlyOn?: "NETWORK_ERROR" | string[];
  sameRegion?: boolean;
  type: "EXPONENTIAL" | "FIXED" | "LINEAR" | "NO_RETRIES" | "SINGLE_RETRY";
};

type RetryStrategyOptions = Omit<RetryStrategy, "type">;

export const RetryStrategyBuilder = {
  exponentialStrategy: (options: RetryStrategyOptions = {}): RetryStrategy => ({
    ...options,
    type: "EXPONENTIAL",
  }),
  fixedStrategy: (options: RetryStrategyOptions = {}): RetryStrategy => ({
    ...options,
    type: "FIXED",
  }),
  linearStrategy: (options: RetryStrategyOptions = {}): RetryStrategy => ({
    ...options,
    type: "LINEAR",
  }),
  noRetries: (): RetryStrategy => ({ maxRetries: 0, type: "NO_RETRIES" }),
  singleRetry: (
    options: Pick<
      RetryStrategyOptions,
      "baseBackoffSeconds" | "onlyOn" | "sameRegion"
    > = {},
  ): RetryStrategy => ({ ...options, type: "SINGLE_RETRY" }),
};

type SharedCheckProps = {
  activated?: boolean;
  alertChannels?: WebhookAlertChannel[];
  environmentVariables?: Array<{ key: string; value: string }>;
  frequency?: FrequencyValue;
  group?: CheckGroup | CheckGroupV2;
  muted?: boolean;
  name?: string;
  retryStrategy?: RetryStrategy;
  runParallel?: boolean;
  shouldFail?: boolean;
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
};

export type CheckGroupV2Props = SharedCheckProps & {
  alertChannels?: WebhookAlertChannel[];
  alertEscalationPolicy?: AlertEscalationPolicy;
  locations?: string[];
  privateLocations?: string[];
};

export type CollectedConstruct = {
  kind: string;
  logicalId: string;
  props: unknown;
};

const constructCollectorSymbol = Symbol.for(
  "@selfchecks/selfchecks/construct-collector",
);

function collectConstruct(construct: CollectedConstruct): void {
  const collector = (
    globalThis as typeof globalThis & {
      [constructCollectorSymbol]?: CollectedConstruct[];
    }
  )[constructCollectorSymbol];

  collector?.push(construct);
}

class Construct<Props> {
  readonly logicalId: string;
  readonly props: Props;

  constructor(logicalId: string, props: Props) {
    this.logicalId = logicalId;
    this.props = props;
    collectConstruct({ kind: this.constructor.name, logicalId, props });
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
