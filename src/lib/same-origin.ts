/** Compare the browser origin with the public request host, including proxy deployments. */
export function isSameOriginRequest(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return false;

  try {
    const origin = new URL(originHeader);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const host = forwardedHost || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
    const protocol = forwardedProto ? `${forwardedProto.replace(/:$/u, "")}:` : requestUrl.protocol;
    if (!host) return origin.origin === requestUrl.origin;
    return origin.host.toLocaleLowerCase() === host.toLocaleLowerCase() && origin.protocol === protocol;
  } catch {
    return false;
  }
}
