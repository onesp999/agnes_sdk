export class AgnesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AgnesConfigurationError extends AgnesError {}

export interface AgnesAPIErrorOptions {
  statusCode?: number;
  endpoint?: string;
  requestId?: string;
}

export class AgnesAPIError extends AgnesError {
  readonly statusCode?: number;
  readonly endpoint?: string;
  readonly requestId?: string;

  constructor(message: string, options: AgnesAPIErrorOptions = {}) {
    super(message);
    this.statusCode = options.statusCode;
    this.endpoint = options.endpoint;
    this.requestId = options.requestId;
  }
}

export class AgnesAPIAuthenticationError extends AgnesAPIError {}

export class AgnesAPIBadRequestError extends AgnesAPIError {}

export class AgnesAPIRateLimitError extends AgnesAPIError {}

export class AgnesAPIServerError extends AgnesAPIError {}

export class AgnesAPITimeoutError extends AgnesAPIError {}

export class AgnesAPIAbortError extends AgnesAPIError {}

export class AgnesAPIStreamProtocolError extends AgnesAPIError {}

export class AgnesVideoTaskFailedError extends AgnesAPIError {}
