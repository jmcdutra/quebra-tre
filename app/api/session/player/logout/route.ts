import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionToken } from "@/lib/session";
import { getStore } from "@/lib/store";

export async function POST() {
  const token = await getSessionToken("player");

  if (token) {
    await getStore().leavePlayerSession(token);
  }

  await clearSessionCookie("player");
  return NextResponse.json({ ok: true });
}
