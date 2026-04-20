export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly nextStep: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}