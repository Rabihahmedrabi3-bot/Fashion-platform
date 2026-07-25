export class AppError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    if (code !== undefined) this.code = code;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message, "bad_request");
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string) {
    super(422, message, "unprocessable_entity");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "conflict");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message, "not_found");
  }
}

export class GoneError extends AppError {
  constructor(message: string) {
    super(410, message, "gone");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(401, message, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, message, "forbidden");
  }
}
