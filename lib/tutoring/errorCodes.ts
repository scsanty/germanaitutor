// Stable identifiers for student-facing API errors. The client shows `errors.<code>` from the
// message catalog (in the interface language) and falls back to the English `error` text.
export type ErrorCode =
  | 'not_found'
  | 'level_locked'
  | 'bad_request'
  | 'lesson_not_completed'
  | 'not_due'
  | 'no_provider'
  | 'no_model'
  | 'credentials_unreadable'
  | 'ai_failed'
  | 'ai_bad_reply'
  | 'ai_no_exercises'
  | 'no_session'
  | 'no_exam'
  | 'invalid_daily_cap';

export type ErrorParams = Record<string, string>;

export interface ApiErrorBody {
  error: string;
  code: ErrorCode;
  params?: ErrorParams;
}

export function errorBody(error: string, code: ErrorCode, params?: ErrorParams): ApiErrorBody {
  return params ? { error, code, params } : { error, code };
}

// `errors.ai_failed` has a {detail} placeholder. A body that reaches the client without
// params.detail (a fallback code) would show the raw key, so the message fills it in.
export function errorBodyFor(err: { message: string; code: ErrorCode; params?: ErrorParams }): ApiErrorBody {
  const params = err.code === 'ai_failed' && !err.params?.detail ? { ...err.params, detail: err.message } : err.params;
  return errorBody(err.message, err.code, params);
}
