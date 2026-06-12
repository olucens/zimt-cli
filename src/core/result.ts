export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

export interface CommonOpts {
  /** Suppress all console output. */
  silent?: boolean;
}
