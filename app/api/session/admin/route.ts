import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/session";
import { getStore } from "@/lib/store";

const payloadSchema = z.object({ nickname: z.string().min(1).max(24), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const { session, token } = await getStore().createAdminSession(payload.nickname, payload.password);
    await setSessionCookie("admin", token);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a sessão admin.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
