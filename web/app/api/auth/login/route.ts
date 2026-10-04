import { NextResponse } from "next/server";
import { provider, oidc } from "@/lib/auth";
import {
  config,
  random,
  cookieName,
  cookieOptions,
  locale,
} from "@/lib/security";
import { put } from "@/lib/store";
export async function GET(request: Request) {
  const lang = locale(new URL(request.url).searchParams.get("locale"));
  try {
    const c = config(),
      p = await provider(),
      verifier = oidc.randomPKCECodeVerifier(),
      state = random(),
      nonce = random();
    const id = await put(
      "login",
      { verifier, state, nonce, locale: lang },
      600,
    );
    const url = oidc.buildAuthorizationUrl(p, {
      redirect_uri: c.origin + "/api/auth/callback",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
    });
    const r = NextResponse.redirect(url);
    r.cookies.set(cookieName("login"), id, cookieOptions(600));
    r.headers.set("Cache-Control", "no-store");
    return r;
  } catch {
    return NextResponse.redirect(
      config().origin + `/${lang}/login?error=identityUnavailable`,
    );
  }
}
