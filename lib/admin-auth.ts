const ADMIN_REALM = "Tre3";

function decodeBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  const encoded = header.slice(6).trim();
  try {
    const decoded = typeof atob === "function"
      ? atob(encoded)
      : Buffer.from(encoded, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) {
      return null;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function isValidAdminBasicAuth(header: string | null) {
  const credentials = decodeBasicAuth(header);
  const expectedUser = process.env.ADMIN_PANEL_USER || "Treinadores";
  const expectedPassword = process.env.ADMIN_PANEL_PASSWORD || process.env.ADMIN_PASSWORD || "tremelhorcia";

  return credentials?.username === expectedUser && credentials.password === expectedPassword;
}

export function buildAdminAuthChallenge() {
  return new Response("Autenticação necessária.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${ADMIN_REALM}", charset="UTF-8"`,
    },
  });
}
