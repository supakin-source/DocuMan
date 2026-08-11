/**
 * Domain errors. Each maps to a distinct HTTP status at the route boundary, so
 * callers never have to inspect messages.
 */

export class NotFoundError extends Error {
  constructor(message = "ไม่พบเอกสาร") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The caller is signed in but not allowed to see or touch this resource. */
export class ForbiddenError extends Error {
  constructor(message = "ไม่มีสิทธิ์เข้าถึงเอกสารนี้") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The request is well-formed but the document is not in a state that allows it. */
export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

/** The submitted data fails a business rule. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
