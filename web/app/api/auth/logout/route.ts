import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  config,
  cookieName,
  cookieOptions,
  checkMutation,
  locale,
} from "@/lib/security";
import { requireSession, provider, oidc } from "@/lib/auth";
import { remove } from "@/lib/store";
import { failure } from "@/lib/api";
export async function POST(request: Request) {
  try {
    const s = await requireSession();
    checkMutation(request, s.csrf);
    const id = (await cookies()).get(cookieName())?.value;
    if (id) await remove(id);
    const lang = locale(new URL(request.url).searchParams.get("locale"));
    let location = config().origin + `/${lang}/login`;
    try {
      location = oidc.buildEndSessionUrl(await provider(), {
        id_token_hint: s.idToken,
        post_logout_redirect_uri: location,
      }).href;
    } catch {
      /* The local session is already revoked. */
    }
    const r = NextResponse.json({ location });
    r.cookies.set(cookieName(), "", cookieOptions(0));
    return r;
  } catch (e) {
    return failure(e);
  }
}
