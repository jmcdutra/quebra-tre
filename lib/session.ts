import crypto from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, PLAYER_COOKIE } from "@/lib/game-config";
import type { SessionRole } from "@/lib/types";

function cookieName(role: SessionRole) {
  return role === "admin" ? ADMIN_COOKIE : PLAYER_COOKIE;
}

export function createSessionToken() {
  return crypto.randomUUID();
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function setSessionCookie(role: SessionRole, token: string) {
  const store = await cookies();
  store.set(cookieName(role), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(role: SessionRole) {
  const store = await cookies();
  store.delete(cookieName(role));
}

export async function getSessionToken(role: SessionRole) {
  const store = await cookies();
  return store.get(cookieName(role))?.value ?? null;
}
