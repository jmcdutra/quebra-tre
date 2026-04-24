import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionToken } from "@/lib/session";
import { getStore } from "@/lib/store";

const payloadSchema = z.object({ totalTimeMs: z.number(), totalMoves: z.number() });

export async function POST(request: Request) {
  try {
    const playerToken = await getSessionToken("player");
    if (!playerToken) {
      return NextResponse.json({ ok: false, error: "Sessão do jogador ausente." }, { status: 401 });
    }
    const payload = payloadSchema.parse(await request.json());
    const bootstrap = await getStore().finishGame(playerToken, payload);
    return NextResponse.json({ ok: true, bootstrap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível finalizar a campanha.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
