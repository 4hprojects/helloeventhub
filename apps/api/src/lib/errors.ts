export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const unauthorized = () => new HttpError(401, 'unauthenticated', 'Please sign in');
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, 'forbidden', msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
export const unprocessable = (code: string, msg: string, fieldErrors?: Record<string, string[]>) =>
  new HttpError(422, code, msg, fieldErrors);
export const revisionConflict = () =>
  conflict('revision_conflict', 'This record was changed by someone else. Reload and try again.');
