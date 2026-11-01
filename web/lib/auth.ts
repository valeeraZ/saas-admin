import "server-only";
import * as oidc from "openid-client";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  config,
  allowedSubject,
  cookieName,
  ConsoleError,
} from "./security.ts";
import { withSession, remove, type Session } from "./store.ts";
let discovery: Promise<oidc.Configuration> | undefined;
export function provider() {
  const c = config();
  return (discovery ??= oidc
    .discovery(new URL(c.issuer), c.clientId, c.secret, undefined, {
      timeout: 5,
      ...(c.issuer.startsWith("http:")
        ? { execute: [oidc.allowInsecureRequests] }
        : {}),
    })
    .catch((e) => {
      discovery = undefined;
      throw e;
    }));
}
export { oidc };
export const requireSession = cache(async (): Promise<Session> => {
  const id = (await cookies()).get(cookieName())?.value;
  if (!id) throw new ConsoleError("unauthorized", 401);
  try {
    const s = await withSession(id, async (s) => {
      if (!allowedSubject(s.sub)) throw new ConsoleError("forbidden", 403);
      const p = await provider();
      if (s.tokenExpires < Date.now() + 30000) {
        if (!s.refreshToken) throw new ConsoleError("unauthorized", 401);
        const tokens = await oidc.refreshTokenGrant(p, s.refreshToken);
        if (!tokens.access_token || !tokens.expires_in)
          throw new ConsoleError("unauthorized", 401);
        s = {
          ...s,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? s.refreshToken,
          idToken: tokens.id_token ?? s.idToken,
          tokenExpires: Date.now() + tokens.expires_in * 1000,
        };
      }
      // No cached authorization: revocation and IdP outages deny reads and writes.
      const token = await oidc.tokenIntrospection(p, s.accessToken);
      if (
        !token.active ||
        token.sub !== s.sub ||
        token.client_id !== config().clientId
      )
        throw new ConsoleError("unauthorized", 401);
      return s;
    });
    if (!s) throw new ConsoleError("unauthorized", 401);
    return s;
  } catch (e) {
    if (e instanceof ConsoleError) {
      await remove(id);
      throw e;
    }
    throw new ConsoleError("identityUnavailable", 503);
  }
});
