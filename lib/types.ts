export type SessionRole = "player" | "admin";
export type SessionStatus = "waiting" | "countdown" | "playing" | "finished" | "offline";
export type RoundStatus = "countdown" | "live" | "finished";

export interface SessionView {
  id: string;
  nickname: string;
  role: SessionRole;
  status: SessionStatus;
  avatarUrl: string;
  currentRoundId: string | null;
  connectedAt: string;
  lastSeenAt: string;
}

export interface RoundParticipantView {
  sessionId: string;
  nickname: string;
  avatarUrl: string;
  progressPercent: number;
  levelsCompleted: number;
  currentLevel: number;
  totalMoves: number;
  elapsedMs: number;
  isFinished: boolean;
  placement: number | null;
  finishedAt: string | null;
}

export interface RoundView {
  id: string;
  status: RoundStatus;
  countdownStartsAt: string;
  startsAt: string;
  finishedAt: string | null;
  participants: RoundParticipantView[];
}

export interface RankingEntryView {
  id: string;
  nickname: string;
  avatarUrl: string;
  totalTimeMs: number;
  totalMoves: number;
  totalPieces: number;
  levels: number;
  finishedAt: string;
}

export interface BootstrapPayload {
  self: SessionView | null;
  admins: SessionView[];
  onlinePlayers: SessionView[];
  waitingPlayers: SessionView[];
  currentRound: RoundView | null;
  rankings: RankingEntryView[];
  now: string;
}

export interface AuthResponse {
  ok: boolean;
  session?: SessionView;
  error?: string;
}
