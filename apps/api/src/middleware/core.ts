import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { ApiErrorBody } from '@heh/contracts';
import { HttpError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  (req as unknown as { id: string }).id = req.requestId;
  next();
};

export function zodFieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(422, 'validation_failed', 'Please check the highlighted fields.', zodFieldErrors(r.error));
  return r.data;
}

/** Wrap an async handler so rejections reach the error middleware. */
export const ah =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let status = 500;
    let body: ApiErrorBody['error'] = { code: 'internal_error', message: 'Something went wrong. Please try again.', requestId: req.requestId };
    if (err instanceof HttpError) {
      status = err.status;
      body = { code: err.code, message: err.message, requestId: req.requestId, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) };
    } else if (err instanceof ZodError) {
      status = 422;
      body = { code: 'validation_failed', message: 'Invalid request', requestId: req.requestId, fieldErrors: zodFieldErrors(err) };
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      body = { code: 'payload_too_large', message: 'Request too large', requestId: req.requestId };
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      body = { code: 'bad_json', message: 'Malformed JSON body', requestId: req.requestId };
    }
    if (status >= 500) logger.error({ err: { message: err?.message, stack: err?.stack, name: err?.name }, requestId: req.requestId }, 'request failed');
    if (res.headersSent) return res.end();
    res.status(status).json({ error: body });
  };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => next(new HttpError(404, 'not_found', 'Not found'));
