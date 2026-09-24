/**
 * Field-level input failure whose message is the first field message.
 */
export class ValidationError extends Error {
  /**
   * Field names mapped to the message for each one.
   */
  readonly fields: Record<string, string>;

  /**
   * @param fields - Field names mapped to the message shown for each one.
   */
  constructor(fields: Record<string, string>) {
    const first = Object.values(fields)[0];
    super(typeof first === 'string' ? first : 'Check the highlighted fields.');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * The caller has no signed-in session.
 */
export class UnauthenticatedError extends Error {
  /**
   * @param message - Why the request is unauthenticated.
   */
  constructor(message: string) {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * The caller is signed in but is not allowed to do this.
 */
export class ForbiddenError extends Error {
  /**
   * @param message - Why the request is forbidden.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * The requested record or page does not exist.
 */
export class NotFoundError extends Error {
  /**
   * @param message - What could not be found.
   */
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * The write conflicts with something that already exists.
 */
export class ConflictError extends Error {
  /**
   * @param message - What conflicted.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * The suggestion provider failed or returned an unusable response.
 */
export class AiProviderError extends Error {
  /**
   * @param message - What the provider failure means for the caller.
   */
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * Startup or runtime configuration is missing or not supported.
 */
export class ConfigurationError extends Error {
  /**
   * @param message - What is wrong with the configuration.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
