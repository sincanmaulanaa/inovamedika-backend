export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
