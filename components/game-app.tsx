"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LEVELS, TOTAL_LEVELS, TOTAL_PIECES } from "@/lib/game-config";
import { cleanNickname, getHabboAvatarUrl } from "@/lib/avatar";
import type { BootstrapPayload, RoundParticipantView } from "@/lib/types";

type PieceLocation = { area: "tray" } | { area: "slot"; slotIndex: number };

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shuffleIndexes(length: number) {
  const indexes = Array.from({ length }, (_, index) => index);
  if (indexes.length <= 1) return indexes;
  do {
    for (let index = indexes.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [indexes[index], indexes[randomIndex]] = [indexes[randomIndex], indexes[index]];
    }
  } while (indexes.every((value, index) => value === index));
  return indexes;
}

function getPieceAspect(cols: number, rows: number) {
  return ((16 / 10) * (rows / cols)).toFixed(3);
}

function getProgressForBoard(levelIndex: number, slots: Array<number | null>) {
  const completedPiecesBeforeLevel = LEVELS.slice(0, levelIndex).reduce((sum, level) => sum + level.pieces, 0);
  const correctNow = slots.reduce<number>((sum, piece, slotIndex) => sum + (piece === slotIndex ? 1 : 0), 0);
  return ((completedPiecesBeforeLevel + correctNow) / TOTAL_PIECES) * 100;
}

function getPlacementLabel(player: RoundParticipantView, index: number) {
  if (player.placement) {
    return `${player.placement}º`;
  }
  return `${index + 1}º`;
}

function getPuzzleImage(levelNumber: number) {
  return `/assets/puzzle-${levelNumber}.jpg`;
}

const FALLING_GIFTS = Array.from({ length: 20 }, (_, index) => ({
  id: `gift-${index}`,
  left: `${(index * 4.9 + (index % 4) * 7) % 94}%`,
  duration: `${8.5 + (index % 5) * 1.25}s`,
  delay: `${(index % 6) * -1.35}s`,
  drift: `${(index % 2 === 0 ? 1 : -1) * (18 + (index % 5) * 10)}px`,
  driftMid: `${(index % 2 === 0 ? -1 : 1) * (10 + (index % 4) * 8)}px`,
  rotation: `${(index % 2 === 0 ? 1 : -1) * (110 + (index % 5) * 28)}deg`,
  scale: (0.72 + (index % 4) * 0.1).toFixed(2),
  opacity: (0.22 + (index % 5) * 0.08).toFixed(2),
}));

function getPieceStyle(piece: number, cols: number, rows: number, levelNumber: number): CSSProperties {
  const x = ((piece % cols) / Math.max(1, cols - 1)) * 100;
  const y = ((Math.floor(piece / cols)) / Math.max(1, rows - 1)) * 100;
  return {
    backgroundImage: `url("${getPuzzleImage(levelNumber)}")`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

export function GameApp() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [nickname, setNickname] = useState("");
  const [levelIndex, setLevelIndex] = useState(0);
  const [slots, setSlots] = useState<Array<number | null>>([]);
  const [tray, setTray] = useState<number[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<{ pieceIndex: number; from: PieceLocation } | null>(null);
  const [draggedPiece, setDraggedPiece] = useState<{ pieceIndex: number; from: PieceLocation } | null>(null);
  const [campaignMoves, setCampaignMoves] = useState(0);
  const [levelMoves, setLevelMoves] = useState(0);
  const [campaignElapsedMs, setCampaignElapsedMs] = useState(0);
  const [levelStartAt, setLevelStartAt] = useState<number | null>(null);
  const [levelSnapshotElapsedMs, setLevelSnapshotElapsedMs] = useState(0);
  const [finishModal, setFinishModal] = useState<{ title: string; stats: string; action: string; disabled?: boolean } | null>(null);
  const [nowTick, setNowTick] = useState(() => performance.now());
  const [progressMessage, setProgressMessage] = useState("Arraste ou toque para encaixar");
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const syncSentRef = useRef(0);
  const finishSentRef = useRef(false);

  const self = bootstrap?.self?.role === "player" ? bootstrap.self : null;
  const currentRound = bootstrap?.currentRound ?? null;
  const currentLevel = LEVELS[levelIndex];
  const phase = !self || !currentRound ? "idle" : self.status === "countdown" ? "countdown" : self.status === "finished" ? "finished" : "playing";
  const liveElapsedMs = levelStartAt ? nowTick - levelStartAt : 0;
  const timerLabel = formatTime(campaignElapsedMs + liveElapsedMs);
  const countdownMs = currentRound ? Math.max(0, new Date(currentRound.startsAt).getTime() - Date.now()) : 0;
  const countdownLabel = `${Math.ceil(countdownMs / 1000)}`;

  const loadBootstrap = useCallback(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    const data = (await response.json()) as BootstrapPayload;
    setBootstrap(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(performance.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1180px)");
    const syncLayout = () => setIsCompactLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  const startLevel = useCallback((index: number) => {
    const level = LEVELS[index];
    setLevelIndex(index);
    setSlots(Array.from({ length: level.pieces }, () => null));
    setTray(shuffleIndexes(level.pieces));
    setSelectedPiece(null);
    setDraggedPiece(null);
    setLevelMoves(0);
    setLevelSnapshotElapsedMs(0);
    setLevelStartAt(performance.now());
    setProgressMessage("Arraste ou toque para encaixar");
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadBootstrap().catch(() => {});
    }, 2000);
    return () => window.clearInterval(interval);
  }, [loadBootstrap]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if ((self?.status === "playing" || self?.status === "finished") && slots.length === 0 && tray.length === 0) {
      startLevel(0);
    }
  }, [self?.status, slots.length, startLevel, tray.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (phase !== "countdown" || !currentRound) {
      return;
    }
    const tick = window.setInterval(() => {
      if (new Date(currentRound.startsAt).getTime() <= Date.now()) {
        if (slots.length === 0 && tray.length === 0) {
          startLevel(0);
        }
        loadBootstrap().catch(() => {});
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [currentRound, loadBootstrap, phase, slots.length, startLevel, tray.length]);

  const syncProgress = useCallback(async (override?: { level: number; slots: Array<number | null>; moves: number; elapsedMs: number }) => {
    if (!self || !currentRound) return;
    const nowStamp = Date.now();
    if (!override && nowStamp - syncSentRef.current < 500) return;
    syncSentRef.current = nowStamp;
    const level = override?.level ?? levelIndex;
    const currentSlots = override?.slots ?? slots;
    const elapsedMs = override?.elapsedMs ?? campaignElapsedMs + (levelStartAt ? performance.now() - levelStartAt : 0);
    const body = {
      currentLevel: level + 1,
      levelsCompleted: level,
      progressPercent: getProgressForBoard(level, currentSlots),
      totalMoves: override?.moves ?? campaignMoves,
      elapsedMs,
    };
    const response = await fetch("/api/game/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (result.bootstrap) {
      setBootstrap(result.bootstrap as BootstrapPayload);
    }
  }, [campaignElapsedMs, campaignMoves, currentRound, levelIndex, levelStartAt, self, slots]);

  useEffect(() => {
    if (phase !== "playing" || !self || !currentRound) return;
    const interval = window.setInterval(() => {
      syncProgress().catch(() => {});
    }, 2000);
    return () => window.clearInterval(interval);
  }, [currentRound, phase, self, syncProgress]);

  const registerMove = useCallback((pieceMoved = true) => {
    if (!pieceMoved) return;
    setCampaignMoves((value) => value + 1);
    setLevelMoves((value) => value + 1);
  }, []);

  const checkLevelComplete = useCallback((nextSlots: Array<number | null>, nextCampaignMoves: number) => {
    const complete = nextSlots.every((piece, index) => piece === index);
    if (!complete) return;
    const elapsedThisLevel = levelSnapshotElapsedMs + (levelStartAt ? performance.now() - levelStartAt : 0);
    setCampaignElapsedMs((prev) => prev + elapsedThisLevel);
    setLevelSnapshotElapsedMs(elapsedThisLevel);
    setLevelStartAt(null);

    if (levelIndex === TOTAL_LEVELS - 1) {
      const totalTime = campaignElapsedMs + elapsedThisLevel;
      setFinishModal({
        title: "Campanha concluída",
        stats: `${self?.nickname ?? "Jogador"}, você terminou as 5 fases em ${formatTime(totalTime)} com ${nextCampaignMoves} movimentos.`,
        action: "Nova campanha",
        disabled: true,
      });
      if (!finishSentRef.current) {
        finishSentRef.current = true;
        fetch("/api/game/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ totalTimeMs: totalTime, totalMoves: nextCampaignMoves }),
        })
          .then((response) => response.json())
          .then((result) => {
            if (result.bootstrap) {
              setBootstrap(result.bootstrap as BootstrapPayload);
            }
            setFinishModal((modal) => modal ? { ...modal, disabled: false } : modal);
          })
          .catch(() => {
            setFinishModal((modal) => modal ? { ...modal, disabled: false } : modal);
          });
      }
      return;
    }

    setFinishModal({
      title: `Fase ${currentLevel.number} concluída`,
      stats: `${currentLevel.pieces} peças nesta etapa em ${formatTime(elapsedThisLevel)} com ${levelMoves + 1} movimentos. Total: ${formatTime(campaignElapsedMs + elapsedThisLevel)} e ${nextCampaignMoves} movimentos.`,
      action: "Próxima fase",
    });
  }, [campaignElapsedMs, currentLevel.number, currentLevel.pieces, levelIndex, levelMoves, levelSnapshotElapsedMs, levelStartAt, self?.nickname]);

  const movePiece = useCallback((pieceIndex: number, from: PieceLocation, destination: PieceLocation) => {
    if (phase !== "playing") return;
    const nextSlots = [...slots];
    const nextTray = [...tray];

    const removeFrom = (location: PieceLocation) => {
      if (location.area === "tray") {
        const trayIndex = nextTray.indexOf(pieceIndex);
        if (trayIndex >= 0) nextTray.splice(trayIndex, 1);
      } else {
        nextSlots[location.slotIndex] = null;
      }
    };

    const placeInto = (location: PieceLocation) => {
      if (location.area === "tray") {
        nextTray.push(pieceIndex);
      } else {
        const occupant = nextSlots[location.slotIndex];
        if (occupant !== null && occupant !== pieceIndex) {
          if (from.area === "slot") {
            nextSlots[from.slotIndex] = occupant;
          } else {
            nextTray.push(occupant);
          }
        }
        nextSlots[location.slotIndex] = pieceIndex;
      }
    };

    removeFrom(from);
    placeInto(destination);

    setSlots(nextSlots);
    setTray(nextTray);
    setSelectedPiece(null);
    setProgressMessage("Arraste ou toque para encaixar");
    const nextMoves = campaignMoves + 1;
    registerMove();
    syncProgress({
      level: levelIndex,
      slots: nextSlots,
      moves: nextMoves,
      elapsedMs: campaignElapsedMs + (levelStartAt ? performance.now() - levelStartAt : 0),
    }).catch(() => {});
    checkLevelComplete(nextSlots, nextMoves);
  }, [campaignElapsedMs, campaignMoves, checkLevelComplete, levelIndex, levelStartAt, phase, registerMove, slots, syncProgress, tray]);

  const handlePieceClick = useCallback((pieceIndex: number, from: PieceLocation) => {
    if (phase !== "playing") return;
    const sameOrigin = selectedPiece
      && selectedPiece.pieceIndex === pieceIndex
      && selectedPiece.from.area === from.area
      && (from.area === "tray" || (selectedPiece.from.area === "slot" && selectedPiece.from.slotIndex === from.slotIndex));
    if (sameOrigin) {
      setSelectedPiece(null);
      setProgressMessage("Arraste ou toque para encaixar");
      return;
    }
    setSelectedPiece({ pieceIndex, from });
    setProgressMessage("Toque em uma casa para encaixar");
  }, [phase, selectedPiece]);

  const handleSlotClick = useCallback((slotIndex: number) => {
    if (!selectedPiece) return;
    movePiece(selectedPiece.pieceIndex, selectedPiece.from, { area: "slot", slotIndex });
  }, [movePiece, selectedPiece]);

  const handleTrayDrop = useCallback(() => {
    if (!draggedPiece || draggedPiece.from.area === "tray") return;
    movePiece(draggedPiece.pieceIndex, draggedPiece.from, { area: "tray" });
    setDraggedPiece(null);
  }, [draggedPiece, movePiece]);

  const nextAction = useCallback(() => {
    setFinishModal(null);
    if (levelIndex >= TOTAL_LEVELS - 1) {
      finishSentRef.current = false;
      setCampaignMoves(0);
      setCampaignElapsedMs(0);
      setLevelMoves(0);
      setLevelSnapshotElapsedMs(0);
      startLevel(0);
      return;
    }
    startLevel(levelIndex + 1);
  }, [levelIndex, startLevel]);

  const handleLogin = async () => {
    setAuthError("");
    const response = await fetch("/api/session/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAuthError(result.error || "Não foi possível entrar na fila.");
      return;
    }
    setNickname("");
    await loadBootstrap();
  };

  const onlinePlayers = bootstrap?.onlinePlayers ?? [];
  const correctPieces = slots.reduce<number>((sum, piece, index) => sum + (piece === index ? 1 : 0), 0);
  const rankingItems = useMemo(() => (bootstrap?.rankings ?? []).slice(0, 10), [bootstrap?.rankings]);
  const liveLeaderboard = (
    <aside className="live-sidebar">
      <div className="tray-heading leaderboard-heading">
        <strong>Corrida ao vivo</strong>
        <span>{currentRound?.status === "countdown" ? "Contagem ativa" : "Posições em tempo real"}</span>
      </div>
      <div className="live-leaderboard">
        {(currentRound?.participants ?? []).map((player, index) => (
          <article key={player.sessionId} className={`live-row ${player.sessionId === self?.id ? "is-self" : ""}`}>
            <span className="ranking-position mini">{getPlacementLabel(player, index)}</span>
            <img src={player.avatarUrl} alt={player.nickname} />
            <div>
              <strong>{player.nickname}</strong>
              <span>{player.isFinished ? `Finalizou em ${formatTime(player.elapsedMs)}` : `${player.levelsCompleted}/${TOTAL_LEVELS} fases • ${Math.round(player.progressPercent)}%`}</span>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );

  if (loading) {
    return <main className="app-shell"><section className="game-area"><div className="puzzle-panel"><div className="board-shell centered-copy"><strong>Carregando estado da arena...</strong></div></div></section></main>;
  }

  if (!self) {
    return (
      <main className="app-shell queue-app-shell">
        <section className="queue-screen" aria-labelledby="queue-title">
          <div className="queue-gifts" aria-hidden="true">
            {FALLING_GIFTS.map((gift) => (
              <img
                key={gift.id}
                className="queue-gift"
                src="/assets/hc_gift_31days_icon.png"
                alt=""
                style={{
                  ["--gift-left" as string]: gift.left,
                  ["--gift-duration" as string]: gift.duration,
                  ["--gift-delay" as string]: gift.delay,
                  ["--gift-drift" as string]: gift.drift,
                  ["--gift-drift-mid" as string]: gift.driftMid,
                  ["--gift-rotation" as string]: gift.rotation,
                  ["--gift-scale" as string]: gift.scale,
                  ["--gift-opacity" as string]: gift.opacity,
                }}
              />
            ))}
          </div>
          <div className="queue-screen__content">
            <section className="start-dialog queue-start-dialog" aria-labelledby="startTitle">
              <div className="start-brand" aria-hidden="true">
                <img src="/assets/image-206.png" alt="" />
                <p>Companhia dos Treinadores</p>
                <strong>Quebra</strong>
                <span>Cabecas</span>
              </div>
              <div className="start-form">
                <label className="start-name" htmlFor="startName">
                  <span className="sr-only">Nickname do jogador</span>
                  <img src={getHabboAvatarUrl(nickname || "Habbo")} alt="" aria-hidden="true" />
                  <input id="startName" type="text" maxLength={24} autoComplete="nickname" placeholder="Seu nickname" value={nickname} onChange={(event) => setNickname(cleanNickname(event.target.value))} onKeyDown={(event) => event.key === "Enter" ? handleLogin() : undefined} />
                </label>
                <p className="form-error">{authError}</p>
                <button className="primary-button wide" type="button" onClick={handleLogin}>Confirmar nickname</button>
              </div>
            </section>
          </div>
        </section>
      </main>
    );
  }

  if (self.status === "waiting") {
    return (
      <main className="app-shell queue-app-shell">
        <section className="queue-screen" aria-labelledby="queue-title">
          <div className="queue-gifts" aria-hidden="true">
            {FALLING_GIFTS.map((gift) => (
              <img
                key={gift.id}
                className="queue-gift"
                src="/assets/hc_gift_31days_icon.png"
                alt=""
                style={{
                  ["--gift-left" as string]: gift.left,
                  ["--gift-duration" as string]: gift.duration,
                  ["--gift-delay" as string]: gift.delay,
                  ["--gift-drift" as string]: gift.drift,
                  ["--gift-drift-mid" as string]: gift.driftMid,
                  ["--gift-rotation" as string]: gift.rotation,
                  ["--gift-scale" as string]: gift.scale,
                  ["--gift-opacity" as string]: gift.opacity,
                }}
              />
            ))}
          </div>
          <div className="queue-screen__content">
            <img className="queue-logo" src="/assets/image-206.png" alt="" aria-hidden="true" />
            <div className="queue-copy">
              <h1 id="queue-title">A <span>GINCANA</span> JA VAI COMECAR!</h1>
              <p>Estamos esperando que todos os policiais entrem na gincana. Em breve, iremos começar. Prepare-se, a batalha pelos prêmios será brutal!</p>
            </div>
            <div className="queue-crowd" aria-live="polite">
              {(bootstrap?.waitingPlayers ?? []).map((player) => (
                <article key={player.id} className="queue-avatar">
                  <img src={player.avatarUrl} alt={player.nickname} />
                  <span>{player.nickname}</span>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="app-shell">
        <section className="game-area" aria-labelledby="game-title">
          <header className="topbar">
            <section className="top-online" aria-label="Jogadores online">
              <div className="online-title">
                <span>Onlines</span>
                <strong>{onlinePlayers.length}</strong>
              </div>
              <div className="online-list" aria-live="polite">
                {onlinePlayers.map((player) => (
                  <article key={player.id} className="online-player">
                    <img src={player.avatarUrl} alt={player.nickname} />
                    <div>
                      <strong>{player.nickname}</strong>
                      <span>{player.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="brand-lockup">
              <p>Companhia dos Treinadores</p>
              <div className="brand-main">
                <img src="/assets/image-206.png" alt="" aria-hidden="true" />
                <div>
                  <h1 id="game-title">Quebra</h1>
                  <span>Cabecas</span>
                </div>
              </div>
            </div>

            <div className="player-card" aria-live="polite">
              <strong>{self?.nickname || "Jogador"}</strong>
              <img src={self?.avatarUrl || getHabboAvatarUrl("Habbo")} alt={self?.nickname || "Jogador"} />
            </div>
          </header>

          <section className="puzzle-panel" aria-label="Área do quebra-cabeças">
            <div className="status-row">
              <div className="metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v2H9V2Zm2 3h2v2h-2V5Zm1 17a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm0-3a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-1-9h2v4h3v2h-5v-6Z"/></svg><strong>{timerLabel}</strong></div>
              <div className="metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16v2H4v-2Zm1-2V8h4V4h6v4h4v10H5Zm6-10h2V6h-2v2Zm-4 8h10v-6H7v6Z"/></svg><strong>{levelIndex + 1}/{TOTAL_LEVELS}</strong></div>
              <div className="metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v5H9a2 2 0 1 0 0 4h2v7H4v-7h2a2 2 0 1 0 0-4H4V4Zm9 0h7v7h-3a2 2 0 1 0 0 4h3v5h-7v-5h-2.2a3.9 3.9 0 0 1 0-8H13V4Z"/></svg><strong>{currentLevel.pieces}</strong></div>
              <div className="metric metric--wide" aria-live="polite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5 1.4-1.4L9 14.2 18.6 4.6 20 6Z"/></svg><strong>{correctPieces}/{currentLevel.pieces}</strong></div>
              <div className="metric"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 5 9h4v6h6V9h4l-7-7ZM5 15l-3 3 3 3v-2h14v2l3-3-3-3v2H5v-2Z"/></svg><strong>{campaignMoves}</strong></div>
              <div className="tool-buttons">
                <button className="ranking-button" type="button" onClick={() => setFinishModal({ title: "Pódio geral", stats: "Os melhores tempos da arena em tempo real.", action: "Fechar" })}>Ver ranking</button>
              </div>
            </div>

            {self && (
              <>
                <div className="board-shell board-grid-shell">
                  <div className="board-stage">
                    {phase === "countdown" && (
                      <div className="countdown-overlay">
                        <p className="kicker">Rodada liberada</p>
                        <strong>{countdownLabel}</strong>
                        <span>Prepare-se para começar.</span>
                      </div>
                    )}
                    <div className="puzzle-board" style={{ ["--cols" as string]: currentLevel.cols, ["--rows" as string]: currentLevel.rows } as CSSProperties}>
                      {Array.from({ length: currentLevel.pieces }, (_, slotIndex) => {
                        const piece = slots[slotIndex];
                        return (
                          <div
                            key={slotIndex}
                            className="slot"
                            aria-label={`Casa ${slotIndex + 1}`}
                            onClick={() => handleSlotClick(slotIndex)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => draggedPiece ? movePiece(draggedPiece.pieceIndex, draggedPiece.from, { area: "slot", slotIndex }) : undefined}
                          >
                            {piece !== null && (
                              <button
                                type="button"
                                className={`piece piece--board ${piece === slotIndex ? "is-correct" : ""} ${selectedPiece?.pieceIndex === piece ? "is-selected" : ""}`}
                                draggable={phase === "playing"}
                                onDragStart={() => setDraggedPiece({ pieceIndex: piece, from: { area: "slot", slotIndex } })}
                                onDragEnd={() => setDraggedPiece(null)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handlePieceClick(piece, { area: "slot", slotIndex });
                                }}
                                style={getPieceStyle(piece, currentLevel.cols, currentLevel.rows, currentLevel.number)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!isCompactLayout && liveLeaderboard}
                </div>

                <div className="tray-block multi-tray-block">
                  <div className="tray-panel">
                    <div className="tray-heading">
                      <strong>Peças soltas</strong>
                      <span>{progressMessage}</span>
                    </div>
                    <div className="pieces-tray" style={{ ["--piece-aspect" as string]: getPieceAspect(currentLevel.cols, currentLevel.rows) } as CSSProperties} onDragOver={(event) => event.preventDefault()} onDrop={handleTrayDrop}>
                      {tray.map((piece) => (
                        <button
                          key={piece}
                          type="button"
                          className={`piece piece--tray ${selectedPiece?.pieceIndex === piece ? "is-selected" : ""}`}
                          draggable={phase === "playing"}
                          onDragStart={() => setDraggedPiece({ pieceIndex: piece, from: { area: "tray" } })}
                          onDragEnd={() => setDraggedPiece(null)}
                          onClick={() => handlePieceClick(piece, { area: "tray" })}
                          style={getPieceStyle(piece, currentLevel.cols, currentLevel.rows, currentLevel.number)}
                        />
                      ))}
                    </div>
                  </div>

                  {isCompactLayout && liveLeaderboard}

                  <div className="tray-panel podium-panel">
                    <div className="tray-heading"><strong>Pódio geral</strong><span>Melhores campanhas</span></div>
                    <div className="ranking-list embed-ranking-list">
                      {rankingItems.length === 0 ? (
                        <div className="ranking-empty">Ainda não há campanhas finalizadas.</div>
                      ) : rankingItems.map((entry, index) => (
                        <div key={entry.id} className="ranking-item compact-ranking-item">
                          <span className="ranking-position">{index + 1}</span>
                          <div>
                            <div className="ranking-name">{entry.nickname}</div>
                            <div className="ranking-meta">{entry.totalMoves} mov. • {entry.totalPieces} peças</div>
                          </div>
                          <span className="ranking-time">{formatTime(entry.totalTimeMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </section>
      </main>

      {finishModal && (
        <div className="modal-backdrop" onClick={() => setFinishModal(null)}>
          <section className="finish-dialog" role="dialog" aria-modal="true" aria-labelledby="finishTitle" onClick={(event) => event.stopPropagation()}>
            <p className="kicker">Status da campanha</p>
            <h2 id="finishTitle">{finishModal.title}</h2>
            <p className="finish-stats">{finishModal.stats}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" disabled={finishModal.disabled} onClick={() => finishModal.action === "Fechar" ? setFinishModal(null) : nextAction()}>{finishModal.action}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
