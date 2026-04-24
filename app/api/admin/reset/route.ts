import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { buildAdminAuthChallenge, isValidAdminBasicAuth } from "@/lib/admin-auth";

export async function POST(request: Request) {
  if (!isValidAdminBasicAuth(request.headers.get("authorization"))) {
    return buildAdminAuthChallenge();
  }

  try {
    const bootstrap = await getStore().resetGame();
    return NextResponse.json({ ok: true, bootstrap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível resetar o jogo.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
