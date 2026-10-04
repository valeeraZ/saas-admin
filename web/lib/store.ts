import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { pool } from "../../src/db.ts";
import { random } from "./security.ts";
export type Session = {
  sub: string;
  name: string;
  csrf: string;
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  tokenExpires: number;
};
export type Login = {
  verifier: string;
  state: string;
  nonce: string;
  locale: string;
};
const digest = (id: string) => createHash("sha256").update(id).digest("hex");
const key = () => {
  const k = Buffer.from(process.env.ADMIN_UI_SESSION_KEY ?? "", "base64");
  if (k.length !== 32) throw Error("Invalid session key");
  return k;
};
export function seal(value: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
export function open(value: string) {
  const b = Buffer.from(value, "base64"),
    c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([c.update(b.subarray(28)), c.final()]).toString("utf8"),
  );
}
export async function put(
  kind: "session" | "login",
  data: Session | Login,
  seconds: number,
) {
  const id = random();
  await pool.query(
    "INSERT INTO admin_console_sessions(id,kind,payload,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')",
    [digest(id), kind, seal(data), seconds],
  );
  return id;
}
export async function consume(id: string): Promise<Login | null> {
  const r = await pool.query(
    "DELETE FROM admin_console_sessions WHERE id=$1 AND kind='login' AND expires_at>now() RETURNING payload",
    [digest(id)],
  );
  return r.rows[0] ? open(r.rows[0].payload) : null;
}
export async function remove(id: string) {
  await pool.query("DELETE FROM admin_console_sessions WHERE id=$1", [
    digest(id),
  ]);
}
export async function withSession(
  id: string,
  validate: (s: Session) => Promise<Session>,
): Promise<Session | null> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "SELECT payload FROM admin_console_sessions WHERE id=$1 AND kind='session' AND expires_at>now() AND last_seen>now()-interval '30 minutes' FOR UPDATE",
      [digest(id)],
    );
    if (!r.rows[0]) {
      await c.query("COMMIT");
      return null;
    }
    const s = await validate(open(r.rows[0].payload));
    await c.query(
      "UPDATE admin_console_sessions SET payload=$2,last_seen=now() WHERE id=$1",
      [digest(id), seal(s)],
    );
    await c.query("COMMIT");
    return s;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
