import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function POST() {
  try {
    const round = await getStore().releaseAll("");
    return NextResponse.json({ ok: true, round });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível liberar a fila.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
