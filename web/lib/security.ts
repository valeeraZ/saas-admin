import { randomBytes, timingSafeEqual } from "node:crypto";
export class ConsoleError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export const random = () => randomBytes(32).toString("base64url");
function local(url: URL) {
  return ["127.0.0.1", "localhost"].includes(url.hostname);
}
export function config() {
  const origin = new URL(process.env.ADMIN_UI_ORIGIN ?? "");
  const issuer = new URL(process.env.ADMIN_UI_OIDC_ISSUER ?? "");
  const insecure = process.env.ADMIN_UI_ALLOW_LOCAL_HTTP === "true";
  for (const url of [origin, issuer]) {
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(insecure && local(url) && url.protocol === "http:"))
    )
      throw Error("Invalid console URL");
  }
  if (origin.pathname !== "/") throw Error("Console origin must have no path");
  const clientId = process.env.ADMIN_UI_OIDC_CLIENT_ID ?? "";
  const secret = process.env.ADMIN_UI_OIDC_CLIENT_SECRET ?? "";
  const subjects = (process.env.ADMIN_UI_ALLOWED_SUBJECTS ?? "")
    .split(",")
    .filter(Boolean);
  if (
    !clientId ||
    !secret ||
    !subjects.length ||
    !process.env.ADMIN_DATABASE_URL ||
    Buffer.from(process.env.ADMIN_UI_SESSION_KEY ?? "", "base64").length !== 32
  )
    throw Error("Console configuration incomplete");
  return {
    origin: origin.origin,
    issuer: issuer.href.replace(/\/$/, ""),
    clientId,
    secret,
    subjects,
    secure: origin.protocol === "https:",
  };
}
export function cookieName(kind = "session") {
  return (config().secure ? "__Host-" : "") + "admin-console-" + kind;
}
export function cookieOptions(seconds: number) {
  return {
    httpOnly: true,
    secure: config().secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: seconds,
  };
}
export function allowedSubject(sub: unknown): sub is string {
  return typeof sub === "string" && config().subjects.includes(sub);
}
export function checkMutation(request: Request, csrf: string) {
  if (request.headers.get("origin") !== config().origin)
    throw new ConsoleError("csrf", 403);
  const actual = Buffer.from(request.headers.get("x-csrf-token") ?? "");
  const expected = Buffer.from(csrf);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ConsoleError("csrf", 403);
}
export async function boundedJSON(request: Request, limit = 16384) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ConsoleError("invalid", 400);
  if (!request.body) throw new ConsoleError("invalid", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new ConsoleError("tooLarge", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ConsoleError("invalid", 400);
  }
}
export function locale(value: string | null) {
  return value === "en" ? "en" : "zh";
}
