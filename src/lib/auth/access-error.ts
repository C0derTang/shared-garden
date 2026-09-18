/** A transient service failure is not a membership denial. */
export class MemberAccessUnavailableError extends Error {
  constructor() {
    super("Garden access check is temporarily unavailable");
    this.name = "MemberAccessUnavailableError";
  }
}
