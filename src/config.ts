export function settings() {
  const auth = new URL(process.env.ADMIN_AUTH_URL ?? "");
  if (
    auth.pathname !== "/" ||
    auth.search ||
    auth.hash ||
    auth.username ||
    auth.password ||
    (auth.protocol !== "https:" &&
      !(
        process.env.ADMIN_ALLOW_LOCAL_HTTP === "true" &&
        auth.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(auth.hostname)
      ))
  )
    throw Error("Invalid ADMIN_AUTH_URL");
  const key = process.env.ADMIN_PORTAL_KEY ?? "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(key))
    throw Error("ADMIN_PORTAL_KEY requires a random service credential");
  if (!process.env.ADMIN_DATABASE_URL)
    throw Error("ADMIN_DATABASE_URL required");
  return { auth: auth.origin, key };
}
