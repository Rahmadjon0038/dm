export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public statusCode = 502,
    public metaCode?: number,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
}
