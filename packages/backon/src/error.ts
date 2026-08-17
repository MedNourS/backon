/**
 * AppError is the one type of error backon's error middleware understands as
 * "expected" — it knows the right HTTP status and produces a stable JSON
 * shape. Anything else thrown is treated as a bug: logged at error level and
 * turned into a generic 500 so internals never leak to a client.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Shape every error response is normalized to, expected or not. */
export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
