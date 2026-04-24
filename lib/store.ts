import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cleanNickname, getHabboAvatarUrl } from "@/lib/avatar";
import {
  ADMIN_PASSWORD_DEFAULT,
  COUNTDOWN_MS,
  HEARTBEAT_GRACE_MS,
  SESSION_TTL_MS,
  TOTAL_LEVELS,
  TOTAL_PIECES,
} from "@/lib/game-config";
import { createSessionToken, hashSessionToken } from "@/lib/session";
import type {
  BootstrapPayload,
  RankingEntryView,
  RoundParticipantView,
  RoundView,
  SessionRole,
  SessionStatus,
  SessionView,
} from "@/lib/types";

export interface ProgressPayload {
  currentLevel: number;
  levelsCompleted: number;
  progressPercent: number;
  totalMoves: number;
  elapsedMs: number;
}

export interface FinishPayload {
  totalTimeMs: number;
  totalMoves: number;
}

interface SessionRecord extends SessionView {
  sessionToken: string;
}

interface RoundRecord {
  id: string;
  status: "countdown" | "live" | "finished";
  countdownStartsAt: string;
  startsAt: string;
  finishedAt: string | null;
}

interface RoundPlayerRecord extends RoundParticipantView {
  roundId: string;
}

interface MemoryState {
  sessions: SessionRecord[];
  rounds: RoundRecord[];
  roundPlayers: RoundPlayerRecord[];
  rankings: RankingEntryView[];
}

export interface Store {
  createPlayerSession(nickname: string): Promise<{ session: SessionView; token: string }>;
  createAdminSession(nickname: string, password: string): Promise<{ session: SessionView; token: string }>;
  bootstrap(playerToken: string | null, adminToken: string | null): Promise<BootstrapPayload>;
  releaseAll(adminToken: string): Promise<RoundView>;
  updateProgress(playerToken: string, payload: ProgressPayload): Promise<BootstrapPayload>;
  finishGame(playerToken: string, payload: FinishPayload): Promise<BootstrapPayload>;
}

const memoryState: MemoryState = {
  sessions: [],
  rounds: [],
  roundPlayers: [],
  rankings: [],
};

function now() {
  return new Date();
}

function isoNow() {
  return now().toISOString();
}

function isActiveSession(session: { lastSeenAt: string; status: SessionStatus }) {
  return Date.now() - new Date(session.lastSeenAt).getTime() < SESSION_TTL_MS + HEARTBEAT_GRACE_MS && session.status !== "offline";
}

function compareRankings(a: RankingEntryView, b: RankingEntryView) {
  if (a.totalTimeMs !== b.totalTimeMs) {
    return a.totalTimeMs - b.totalTimeMs;
  }
  return a.totalMoves - b.totalMoves;
}

function deriveStatus(session: SessionRecord, activeRound: RoundRecord | null): SessionStatus {
  if (!isActiveSession(session)) {
    return "offline";
  }
  if (!session.currentRoundId) {
    return session.status === "finished" ? "finished" : "waiting";
  }
  if (!activeRound || activeRound.id !== session.currentRoundId) {
    return session.status === "finished" ? "finished" : "waiting";
  }
  if (activeRound.status === "countdown") {
    return "countdown";
  }
  if (activeRound.status === "live") {
    return session.status === "finished" ? "finished" : "playing";
  }
  return session.status === "finished" ? "finished" : "waiting";
}

function normalizeProgress(payload: ProgressPayload) {
  return {
    currentLevel: Math.min(Math.max(1, Math.round(payload.currentLevel || 1)), TOTAL_LEVELS),
    levelsCompleted: Math.min(Math.max(0, Math.round(payload.levelsCompleted || 0)), TOTAL_LEVELS),
    progressPercent: Math.min(Math.max(0, Number(payload.progressPercent || 0)), 100),
    totalMoves: Math.max(0, Math.round(payload.totalMoves || 0)),
    elapsedMs: Math.max(0, Math.round(payload.elapsedMs || 0)),
  };
}

function normalizeFinish(payload: FinishPayload) {
  const totalTimeMs = Math.max(1_000, Math.round(payload.totalTimeMs || 0));
  const totalMoves = Math.max(TOTAL_PIECES, Math.round(payload.totalMoves || 0));
  return { totalTimeMs, totalMoves };
}

function getCurrentRoundFromMemory(state: MemoryState) {
  const list = [...state.rounds].sort((a, b) => new Date(b.countdownStartsAt).getTime() - new Date(a.countdownStartsAt).getTime());
  return list.find((round) => round.status !== "finished") ?? null;
}

function syncMemoryState(state: MemoryState) {
  const current = getCurrentRoundFromMemory(state);
  const currentTime = Date.now();

  if (current && current.status === "countdown" && new Date(current.startsAt).getTime() <= currentTime) {
    current.status = "live";
    state.sessions.forEach((session) => {
      if (session.currentRoundId === current.id && session.status !== "finished") {
        session.status = "playing";
      }
    });
  }

  state.sessions.forEach((session) => {
    if (!isActiveSession(session)) {
      session.status = "offline";
    }
  });

  if (current && current.status === "live") {
    const players = state.roundPlayers.filter((player) => player.roundId === current.id);
    const everyoneFinished = players.length > 0 && players.every((player) => player.isFinished);
    if (everyoneFinished) {
      current.status = "finished";
      current.finishedAt = isoNow();
      state.sessions.forEach((session) => {
        if (session.currentRoundId === current.id && session.status !== "offline") {
          session.currentRoundId = null;
          session.status = "waiting";
        }
      });
    }
  }
}

function toBootstrap(state: MemoryState, self: SessionRecord | null): BootstrapPayload {
  syncMemoryState(state);
  const currentRound = getCurrentRoundFromMemory(state);
  const onlinePlayers = state.sessions
    .filter((session) => session.role === "player" && isActiveSession(session))
    .map((session) => ({ ...session, status: deriveStatus(session, currentRound) }))
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  const admins = state.sessions
    .filter((session) => session.role === "admin" && isActiveSession(session))
    .map((session) => ({ ...session, status: deriveStatus(session, currentRound) }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, "pt-BR"));
  const waitingPlayers = onlinePlayers.filter((session) => session.status === "waiting");
  const participants = currentRound
    ? state.roundPlayers
        .filter((player) => player.roundId === currentRound.id)
        .sort((a, b) => {
          if (a.isFinished !== b.isFinished) {
            return a.isFinished ? -1 : 1;
          }
          if (a.levelsCompleted !== b.levelsCompleted) {
            return b.levelsCompleted - a.levelsCompleted;
          }
          if (a.progressPercent !== b.progressPercent) {
            return b.progressPercent - a.progressPercent;
          }
          if (a.elapsedMs !== b.elapsedMs) {
            return a.elapsedMs - b.elapsedMs;
          }
          return a.totalMoves - b.totalMoves;
        })
    : [];

  return {
    self: self ? { ...self, status: deriveStatus(self, currentRound) } : null,
    admins,
    onlinePlayers,
    waitingPlayers,
    currentRound: currentRound
      ? {
          ...currentRound,
          participants,
        }
      : null,
    rankings: [...state.rankings].sort(compareRankings).slice(0, 25),
    now: isoNow(),
  };
}

function assertAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD_DEFAULT;
  return password === expected;
}

function findActiveSessionByNickname(state: MemoryState, nickname: string, role: SessionRole) {
  syncMemoryState(state);
  return state.sessions.find(
    (session) => session.role === role && session.nickname.toLowerCase() === nickname.toLowerCase() && isActiveSession(session),
  ) ?? null;
}

function buildSession(role: SessionRole, nickname: string): SessionRecord {
  const token = createSessionToken();
  return {
    id: crypto.randomUUID(),
    sessionToken: hashSessionToken(token),
    nickname,
    role,
    status: role === "player" ? "waiting" : "playing",
    avatarUrl: getHabboAvatarUrl(nickname),
    currentRoundId: null,
    connectedAt: isoNow(),
    lastSeenAt: isoNow(),
  };
}

function findSessionByToken(state: MemoryState, token: string | null, role: SessionRole) {
  if (!token) return null;
  const hashed = hashSessionToken(token);
  const session = state.sessions.find((item) => item.sessionToken === hashed && item.role === role) ?? null;
  if (session) {
    session.lastSeenAt = isoNow();
  }
  return session;
}

function createMemoryStore(): Store {
  return {
    async createPlayerSession(nickname) {
      const clean = cleanNickname(nickname);
      if (!clean) throw new Error("Informe um nickname válido.");
      const token = createSessionToken();
      const active = findActiveSessionByNickname(memoryState, clean, "player");
      if (active) {
        active.sessionToken = hashSessionToken(token);
        active.lastSeenAt = isoNow();
        active.avatarUrl = getHabboAvatarUrl(clean);
        return { session: active, token };
      }
      const session = buildSession("player", clean);
      session.sessionToken = hashSessionToken(token);
      memoryState.sessions.push(session);
      return { session, token };
    },
    async createAdminSession(nickname, password) {
      const clean = cleanNickname(nickname);
      if (!clean) throw new Error("Informe um nickname válido.");
      if (!assertAdminPassword(password)) throw new Error("Senha admin inválida.");
      const token = createSessionToken();
      const active = findActiveSessionByNickname(memoryState, clean, "admin");
      if (active) {
        active.sessionToken = hashSessionToken(token);
        active.lastSeenAt = isoNow();
        active.avatarUrl = getHabboAvatarUrl(clean);
        return { session: active, token };
      }
      const session = buildSession("admin", clean);
      session.sessionToken = hashSessionToken(token);
      memoryState.sessions.push(session);
      return { session, token };
    },
    async bootstrap(playerToken, adminToken) {
      const player = findSessionByToken(memoryState, playerToken, "player");
      const admin = findSessionByToken(memoryState, adminToken, "admin");
      return toBootstrap(memoryState, player ?? admin);
    },
    async releaseAll() {
      syncMemoryState(memoryState);
      const waitingPlayers = memoryState.sessions.filter((session) => session.role === "player" && isActiveSession(session) && !session.currentRoundId && session.status !== "finished");
      if (waitingPlayers.length === 0) throw new Error("Não há jogadores na fila para liberar.");
      const countdownStartsAt = now();
      const startsAt = new Date(countdownStartsAt.getTime() + COUNTDOWN_MS);
      const round: RoundRecord = {
        id: crypto.randomUUID(),
        status: "countdown",
        countdownStartsAt: countdownStartsAt.toISOString(),
        startsAt: startsAt.toISOString(),
        finishedAt: null,
      };
      memoryState.rounds.push(round);
      waitingPlayers.forEach((session) => {
        session.currentRoundId = round.id;
        session.status = "countdown";
        memoryState.roundPlayers.push({
          roundId: round.id,
          sessionId: session.id,
          nickname: session.nickname,
          avatarUrl: session.avatarUrl,
          progressPercent: 0,
          levelsCompleted: 0,
          currentLevel: 1,
          totalMoves: 0,
          elapsedMs: 0,
          isFinished: false,
          placement: null,
          finishedAt: null,
        });
      });
      return toBootstrap(memoryState, null).currentRound as RoundView;
    },
    async updateProgress(playerToken, payload) {
      const session = findSessionByToken(memoryState, playerToken, "player");
      if (!session || !isActiveSession(session)) throw new Error("Sessão do jogador inválida.");
      syncMemoryState(memoryState);
      if (!session.currentRoundId) {
        return toBootstrap(memoryState, session);
      }
      const currentRound = getCurrentRoundFromMemory(memoryState);
      if (!currentRound || currentRound.id !== session.currentRoundId) {
        return toBootstrap(memoryState, session);
      }
      const roundPlayer = memoryState.roundPlayers.find((item) => item.roundId === currentRound.id && item.sessionId === session.id);
      if (!roundPlayer || roundPlayer.isFinished) {
        return toBootstrap(memoryState, session);
      }
      const normalized = normalizeProgress(payload);
      Object.assign(roundPlayer, normalized);
      session.status = deriveStatus(session, currentRound);
      session.lastSeenAt = isoNow();
      return toBootstrap(memoryState, session);
    },
    async finishGame(playerToken, payload) {
      const session = findSessionByToken(memoryState, playerToken, "player");
      if (!session || !isActiveSession(session)) throw new Error("Sessão do jogador inválida.");
      syncMemoryState(memoryState);
      const normalized = normalizeFinish(payload);
      const currentRound = getCurrentRoundFromMemory(memoryState);
      if (session.currentRoundId && currentRound?.id === session.currentRoundId) {
        const roundPlayer = memoryState.roundPlayers.find((item) => item.roundId === currentRound.id && item.sessionId === session.id);
        if (roundPlayer && !roundPlayer.isFinished) {
          const placements = memoryState.roundPlayers.filter((item) => item.roundId === currentRound.id && item.isFinished).length;
          roundPlayer.isFinished = true;
          roundPlayer.finishedAt = isoNow();
          roundPlayer.placement = placements + 1;
          roundPlayer.levelsCompleted = TOTAL_LEVELS;
          roundPlayer.currentLevel = TOTAL_LEVELS;
          roundPlayer.progressPercent = 100;
          roundPlayer.totalMoves = normalized.totalMoves;
          roundPlayer.elapsedMs = normalized.totalTimeMs;
        }
      }
      session.status = "finished";
      session.lastSeenAt = isoNow();
      memoryState.rankings = [
        ...memoryState.rankings,
        {
          id: crypto.randomUUID(),
          nickname: session.nickname,
          avatarUrl: session.avatarUrl,
          totalTimeMs: normalized.totalTimeMs,
          totalMoves: normalized.totalMoves,
          totalPieces: TOTAL_PIECES,
          levels: TOTAL_LEVELS,
          finishedAt: isoNow(),
        },
      ].sort(compareRankings).slice(0, 100);
      return toBootstrap(memoryState, session);
    },
  };
}

async function syncPrismaState() {
  const expiration = new Date(Date.now() - SESSION_TTL_MS - HEARTBEAT_GRACE_MS);
  await prisma.appSession.updateMany({
    where: {
      lastSeenAt: { lt: expiration },
      status: { not: "offline" },
    },
    data: { status: "offline", currentRoundId: null },
  });

  const rounds = await prisma.gameRound.findMany({
    where: { status: { in: ["countdown", "live"] } },
    orderBy: { countdownStartsAt: "desc" },
  });

  for (const round of rounds) {
    if (round.status === "countdown" && round.startsAt <= new Date()) {
      await prisma.gameRound.update({ where: { id: round.id }, data: { status: "live" } });
      await prisma.appSession.updateMany({
        where: { currentRoundId: round.id, status: { not: "finished" } },
        data: { status: "playing" },
      });
    }

    const players = await prisma.roundPlayer.findMany({ where: { roundId: round.id } });
    if (round.status !== "finished" && players.length > 0 && players.every((player) => player.isFinished)) {
      await prisma.gameRound.update({ where: { id: round.id }, data: { status: "finished", finishedAt: new Date() } });
      await prisma.appSession.updateMany({
        where: { currentRoundId: round.id, status: { not: "offline" } },
        data: { currentRoundId: null, status: "waiting" },
      });
    }
  }
}

async function getCurrentRoundPrisma() {
  await syncPrismaState();
  const round = await prisma.gameRound.findFirst({
    where: { status: { in: ["countdown", "live"] } },
    orderBy: { countdownStartsAt: "desc" },
    include: { participants: true },
  });
  return round;
}

function toSessionView(session: {
  id: string;
  nickname: string;
  role: SessionRole;
  status: SessionStatus;
  avatarUrl: string;
  currentRoundId: string | null;
  connectedAt: Date;
  lastSeenAt: Date;
}): SessionView {
  return {
    id: session.id,
    nickname: session.nickname,
    role: session.role,
    status: session.status,
    avatarUrl: session.avatarUrl,
    currentRoundId: session.currentRoundId,
    connectedAt: session.connectedAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
  };
}

function toRoundPlayerView(player: {
  roundId: string;
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
  finishedAt: Date | null;
}): RoundParticipantView {
  return {
    sessionId: player.sessionId,
    nickname: player.nickname,
    avatarUrl: player.avatarUrl,
    progressPercent: player.progressPercent,
    levelsCompleted: player.levelsCompleted,
    currentLevel: player.currentLevel,
    totalMoves: player.totalMoves,
    elapsedMs: player.elapsedMs,
    isFinished: player.isFinished,
    placement: player.placement,
    finishedAt: player.finishedAt?.toISOString() ?? null,
  };
}

function toRankingView(entry: {
  id: string;
  nickname: string;
  avatarUrl: string;
  totalTimeMs: number;
  totalMoves: number;
  totalPieces: number;
  levels: number;
  finishedAt: Date;
}): RankingEntryView {
  return {
    ...entry,
    finishedAt: entry.finishedAt.toISOString(),
  };
}

async function getPrismaSelf(playerToken: string | null, adminToken: string | null) {
  const playerHash = playerToken ? hashSessionToken(playerToken) : null;
  const adminHash = adminToken ? hashSessionToken(adminToken) : null;

  const player = playerHash
    ? await prisma.appSession.findUnique({ where: { sessionToken: playerHash } })
    : null;
  const admin = adminHash && !player
    ? await prisma.appSession.findUnique({ where: { sessionToken: adminHash } })
    : null;
  const self = player ?? admin;
  if (self) {
    await prisma.appSession.update({ where: { id: self.id }, data: { lastSeenAt: new Date() } });
  }
  return self;
}

async function buildPrismaBootstrap(playerToken: string | null, adminToken: string | null): Promise<BootstrapPayload> {
  const self = await getPrismaSelf(playerToken, adminToken);
  const [sessions, rankingEntries, currentRound] = await Promise.all([
    prisma.appSession.findMany({ orderBy: { lastSeenAt: "desc" } }),
    prisma.rankingEntry.findMany({ orderBy: [{ totalTimeMs: "asc" }, { totalMoves: "asc" }], take: 25 }),
    getCurrentRoundPrisma(),
  ]);

  const activeSessions = sessions.filter((session) => Date.now() - session.lastSeenAt.getTime() < SESSION_TTL_MS + HEARTBEAT_GRACE_MS && session.status !== "offline");
  const onlinePlayers = activeSessions.filter((session) => session.role === "player").map(toSessionView);
  const admins = activeSessions.filter((session) => session.role === "admin").map(toSessionView);
  return {
    self: self ? toSessionView(self) : null,
    admins,
    onlinePlayers,
    waitingPlayers: onlinePlayers.filter((session) => session.status === "waiting"),
    currentRound: currentRound
      ? {
          id: currentRound.id,
          status: currentRound.status,
          countdownStartsAt: currentRound.countdownStartsAt.toISOString(),
          startsAt: currentRound.startsAt.toISOString(),
          finishedAt: currentRound.finishedAt?.toISOString() ?? null,
          participants: currentRound.participants.map(toRoundPlayerView).sort((a, b) => {
            if (a.isFinished !== b.isFinished) return a.isFinished ? -1 : 1;
            if (a.levelsCompleted !== b.levelsCompleted) return b.levelsCompleted - a.levelsCompleted;
            if (a.progressPercent !== b.progressPercent) return b.progressPercent - a.progressPercent;
            if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
            return a.totalMoves - b.totalMoves;
          }),
        }
      : null,
    rankings: rankingEntries.map(toRankingView),
    now: isoNow(),
  };
}

function createPrismaStore(): Store {
  return {
    async createPlayerSession(nickname) {
      const clean = cleanNickname(nickname);
      if (!clean) throw new Error("Informe um nickname válido.");
      await syncPrismaState();
      const existing = await prisma.appSession.findFirst({
        where: {
          role: "player",
          nickname: { equals: clean, mode: "insensitive" },
          lastSeenAt: { gte: new Date(Date.now() - SESSION_TTL_MS) },
          status: { not: "offline" },
        },
      });
      const token = createSessionToken();
      if (existing) {
        const session = await prisma.appSession.update({
          where: { id: existing.id },
          data: {
            sessionToken: hashSessionToken(token),
            lastSeenAt: new Date(),
            avatarUrl: getHabboAvatarUrl(clean),
          },
        });
        return { session: toSessionView(session), token };
      }
      const session = await prisma.appSession.create({
        data: {
          sessionToken: hashSessionToken(token),
          nickname: clean,
          role: "player",
          status: "waiting",
          avatarUrl: getHabboAvatarUrl(clean),
        },
      });
      return { session: toSessionView(session), token };
    },
    async createAdminSession(nickname, password) {
      const clean = cleanNickname(nickname);
      if (!clean) throw new Error("Informe um nickname válido.");
      if (!assertAdminPassword(password)) throw new Error("Senha admin inválida.");
      await syncPrismaState();
      const existing = await prisma.appSession.findFirst({
        where: {
          role: "admin",
          nickname: { equals: clean, mode: "insensitive" },
          lastSeenAt: { gte: new Date(Date.now() - SESSION_TTL_MS) },
          status: { not: "offline" },
        },
      });
      const token = createSessionToken();
      if (existing) {
        const session = await prisma.appSession.update({
          where: { id: existing.id },
          data: {
            sessionToken: hashSessionToken(token),
            lastSeenAt: new Date(),
            avatarUrl: getHabboAvatarUrl(clean),
          },
        });
        return { session: toSessionView(session), token };
      }
      const session = await prisma.appSession.create({
        data: {
          sessionToken: hashSessionToken(token),
          nickname: clean,
          role: "admin",
          status: "playing",
          avatarUrl: getHabboAvatarUrl(clean),
        },
      });
      return { session: toSessionView(session), token };
    },
    async bootstrap(playerToken, adminToken) {
      return buildPrismaBootstrap(playerToken, adminToken);
    },
    async releaseAll() {
      await syncPrismaState();
      const waitingPlayers = await prisma.appSession.findMany({
        where: {
          role: "player",
          currentRoundId: null,
          status: { in: ["waiting", "finished"] },
          lastSeenAt: { gte: new Date(Date.now() - SESSION_TTL_MS) },
        },
      });
      if (waitingPlayers.length === 0) throw new Error("Não há jogadores na fila para liberar.");
      const countdownStartsAt = new Date();
      const startsAt = new Date(countdownStartsAt.getTime() + COUNTDOWN_MS);
      const round = await prisma.gameRound.create({
        data: {
          status: "countdown",
          countdownStartsAt,
          startsAt,
          participants: {
            create: waitingPlayers.map((player) => ({
              sessionId: player.id,
              nickname: player.nickname,
              avatarUrl: player.avatarUrl,
            })),
          },
        },
        include: { participants: true },
      });
      await prisma.appSession.updateMany({
        where: { id: { in: waitingPlayers.map((player) => player.id) } },
        data: { currentRoundId: round.id, status: "countdown" },
      });
      return {
        id: round.id,
        status: round.status,
        countdownStartsAt: round.countdownStartsAt.toISOString(),
        startsAt: round.startsAt.toISOString(),
        finishedAt: round.finishedAt?.toISOString() ?? null,
        participants: round.participants.map(toRoundPlayerView),
      };
    },
    async updateProgress(playerToken, payload) {
      await syncPrismaState();
      const session = await prisma.appSession.findUnique({ where: { sessionToken: hashSessionToken(playerToken) } });
      if (!session || session.role !== "player") throw new Error("Sessão do jogador inválida.");
      await prisma.appSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      if (session.currentRoundId) {
        const normalized = normalizeProgress(payload);
        await prisma.roundPlayer.updateMany({
          where: { roundId: session.currentRoundId, sessionId: session.id, isFinished: false },
          data: normalized,
        });
      }
      return buildPrismaBootstrap(playerToken, null);
    },
    async finishGame(playerToken, payload) {
      await syncPrismaState();
      const session = await prisma.appSession.findUnique({ where: { sessionToken: hashSessionToken(playerToken) } });
      if (!session || session.role !== "player") throw new Error("Sessão do jogador inválida.");
      const normalized = normalizeFinish(payload);
      await prisma.$transaction(async (tx) => {
        if (session.currentRoundId) {
          const finishedCount = await tx.roundPlayer.count({ where: { roundId: session.currentRoundId, isFinished: true } });
          await tx.roundPlayer.updateMany({
            where: { roundId: session.currentRoundId, sessionId: session.id, isFinished: false },
            data: {
              levelsCompleted: TOTAL_LEVELS,
              currentLevel: TOTAL_LEVELS,
              progressPercent: 100,
              totalMoves: normalized.totalMoves,
              elapsedMs: normalized.totalTimeMs,
              isFinished: true,
              placement: finishedCount + 1,
              finishedAt: new Date(),
            },
          });
        }
        await tx.appSession.update({ where: { id: session.id }, data: { status: "finished", lastSeenAt: new Date() } });
        await tx.rankingEntry.create({
          data: {
            nickname: session.nickname,
            avatarUrl: session.avatarUrl,
            totalTimeMs: normalized.totalTimeMs,
            totalMoves: normalized.totalMoves,
            totalPieces: TOTAL_PIECES,
            levels: TOTAL_LEVELS,
            finishedAt: new Date(),
          },
        });
      });
      return buildPrismaBootstrap(playerToken, null);
    },
  };
}

let cachedStore: Store | null = null;

export function getStore(): Store {
  if (cachedStore) {
    return cachedStore;
  }
  cachedStore = process.env.DATABASE_URL ? createPrismaStore() : createMemoryStore();
  return cachedStore;
}
