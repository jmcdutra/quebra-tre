import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/session";
import { getStore } from "@/lib/store";

export async function GET() {
  const [playerToken, adminToken] = await Promise.all([
    getSessionToken("player"),
    getSessionToken("admin"),
  ]);
  const payload = await getStore().bootstrap(playerToken, adminToken);
  return NextResponse.json(payload);
}
