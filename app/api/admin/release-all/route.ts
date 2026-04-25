import { NextResponse } from "next/server";
import { buildAdminAuthChallenge, isValidAdminBasicAuth } from "@/lib/admin-auth";
import { getStore } from "@/lib/store";

export async function POST(request: Request) {
  if (!isValidAdminBasicAuth(request.headers.get("authorization"))) {
    return buildAdminAuthChallenge();
  }

  try {
    const bootstrap = await getStore().toggleGameActive();
    return NextResponse.json({ ok: true, bootstrap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível alterar o estado do jogo.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
