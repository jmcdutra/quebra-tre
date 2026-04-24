import { HABBO_IMAGE_BASE, MAX_NICKNAME_LENGTH } from "@/lib/game-config";

export function cleanNickname(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_NICKNAME_LENGTH);
}

export function getHabboAvatarUrl(name: string, headOnly = true) {
  const clean = cleanNickname(name) || "Habbo";
  const params = new URLSearchParams({
    user: clean,
    action: "std",
    direction: "3",
    head_direction: "3",
    gesture: "sml",
    size: headOnly ? "m" : "l",
    img_format: "png",
    ...(headOnly ? { headonly: "1" } : {}),
  });
  return `${HABBO_IMAGE_BASE}?${params.toString()}`;
}
