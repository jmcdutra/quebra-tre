import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionToken } from "@/lib/session";
import { getStore } from "@/lib/store";

const payloadSchema = z.object({
  currentLevel: z.number(),
  levelsCompleted: z.number(),
  progressPercent: z.number(),
  totalMoves: z.number(),
  elapsedMs: z.number(),
});

export async function POST(request: Request) {
  try {
    const playerToken = await getSessionToken("player");
    if (!playerToken) {
      return NextResponse.json({ ok: false, error: "Sessão do jogador ausente." }, { status: 401 });
    }
    const payload = payloadSchema.parse(await request.json());
    const bootstrap = await getStore().updateProgress(playerToken, payload);
    return NextResponse.json({ ok: true, bootstrap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o progresso.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
