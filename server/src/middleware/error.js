import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, message, details, code) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export const notFound = (req, _res, next) =>
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message;
  let details = err.details;
  if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    const flat = err.flatten();
    details = { ...flat.fieldErrors, ...(flat.formErrors.length && { _form: flat.formErrors }) };
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate value';
  }
  if (status >= 500) {
    console.error(err);
    message = 'Internal server error'; // never leak internals
  }
  res.status(status).json({ success: false, message, ...(err.code && { code: err.code }), ...(details && { details }) });
}
