import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isValidAdminBasicAuth } from "@/lib/admin-auth";

export function proxy(request: NextRequest) {
  if (isValidAdminBasicAuth(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tre3", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/tre3", "/api/admin/:path*"],
};
