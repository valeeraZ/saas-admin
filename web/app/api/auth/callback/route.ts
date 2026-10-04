import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { provider, oidc } from "@/lib/auth";
import {
  config,
  allowedSubject,
  random,
  cookieName,
  cookieOptions,
  ConsoleError,
} from "@/lib/security";
import { consume, put, remove } from "@/lib/store";
export async function GET(request: Request) {
  let lang = "zh";
  const c = config();
  try {
    const jar = await cookies(),
      id = jar.get(cookieName("login"))?.value;
    if (!id) throw new ConsoleError("unauthorized", 401);
    const tx = await consume(id);
    if (!tx) throw new ConsoleError("unauthorized", 401);
    lang = tx.locale;
    const url = new URL(c.origin + "/api/auth/callback");
    url.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(await provider(), url, {
      pkceCodeVerifier: tx.verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (
      !tokens.access_token ||
      !tokens.id_token ||
      !tokens.expires_in ||
      !claims
    )
      throw new ConsoleError("unauthorized", 401);
    if (!allowedSubject(claims.sub)) throw new ConsoleError("forbidden", 403);
    const old = jar.get(cookieName())?.value;
    if (old) await remove(old);
    const session = await put(
      "session",
      {
        sub: claims.sub,
        name: String(claims.name ?? claims.preferred_username ?? claims.sub),
        csrf: random(),
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        tokenExpires: Date.now() + tokens.expires_in * 1000,
      },
      28800,
    );
    const r = NextResponse.redirect(c.origin + `/${lang}/applications`);
    r.cookies.set(cookieName(), session, cookieOptions(28800));
    r.cookies.set(cookieName("login"), "", cookieOptions(0));
    return r;
  } catch (e) {
    const code = e instanceof ConsoleError ? e.code : "identityUnavailable";
    const r = NextResponse.redirect(c.origin + `/${lang}/login?error=${code}`);
    r.cookies.set(cookieName("login"), "", cookieOptions(0));
    return r;
  }
}
