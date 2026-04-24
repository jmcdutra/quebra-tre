export const LEVELS = [
  { number: 1, pieces: 10, cols: 5, rows: 2 },
  { number: 2, pieces: 15, cols: 5, rows: 3 },
  { number: 3, pieces: 25, cols: 5, rows: 5 },
  { number: 4, pieces: 30, cols: 6, rows: 5 },
  { number: 5, pieces: 40, cols: 8, rows: 5 },
] as const;

export const TOTAL_PIECES = LEVELS.reduce((total, level) => total + level.pieces, 0);
export const TOTAL_LEVELS = LEVELS.length;
export const COUNTDOWN_MS = 10_000;
export const SESSION_TTL_MS = 45_000;
export const HEARTBEAT_GRACE_MS = 5_000;
export const ADMIN_PASSWORD_DEFAULT = "tremelhorcia";
export const MAX_NICKNAME_LENGTH = 24;
export const PLAYER_COOKIE = "quebra_player_session";
export const ADMIN_COOKIE = "quebra_admin_session";
export const HABBO_IMAGE_BASE = "https://www.habbo.com.br/habbo-imaging/avatarimage";
