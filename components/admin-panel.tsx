"use client";

import { useCallback, useEffect, useState } from "react";
import type { BootstrapPayload } from "@/lib/types";

function formatTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AdminPanel() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [releaseState, setReleaseState] = useState<"idle" | "loading">("idle");
  const [resetState, setResetState] = useState<"idle" | "loading">("idle");

  const loadBootstrap = useCallback(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    const data = (await response.json()) as BootstrapPayload;
    setBootstrap(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const interval = window.setInterval(() => loadBootstrap().catch(() => {}), 2000);
    return () => window.clearInterval(interval);
  }, [loadBootstrap]);

  const handleRelease = async () => {
    setReleaseState("loading");
    setError("");
    const response = await fetch("/api/admin/release-all", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Falha ao alterar estado do jogo.");
      setReleaseState("idle");
      return;
    }
    setReleaseState("idle");
    await loadBootstrap();
  };

  const handleReset = async () => {
    setResetState("loading");
    setError("");
    const response = await fetch("/api/admin/reset", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Falha ao resetar o jogo.");
      setResetState("idle");
      return;
    }
    setResetState("idle");
    await loadBootstrap();
  };

  if (loading) {
    return <main className="app-shell"><section className="game-area"><div className="puzzle-panel"><div className="board-shell centered-copy"><strong>Carregando painel...</strong></div></div></section></main>;
  }

  return (
    <main className="app-shell">
      <section className="game-area admin-game-area">
        <header className="topbar admin-topbar">
          <section className="top-online admin-top-online" aria-label="Painel aberto">
            <div className="online-title"><span>Tre3</span><strong>Livre</strong></div>
            <div className="online-list"></div>
          </section>
          <div className="brand-lockup">
            <p>Companhia dos Treinadores</p>
            <div className="brand-main">
              <img src="/assets/image-206.png" alt="" />
              <div><h1>Tre3</h1><span>Controle</span></div>
            </div>
          </div>
          <div className="player-card admin-player-card"><strong>Painel aberto</strong><img src="/assets/image-206.png" alt="Painel aberto" /></div>
        </header>

        <section className="puzzle-panel admin-panel-shell">
          <div className="status-row admin-status-row">
            <div className="metric"><svg viewBox="0 0 24 24"><path d="M4 4h16v2H4V4Zm0 7h16v2H4v-2Zm0 7h16v2H4v-2Z"/></svg><strong>{bootstrap?.waitingPlayers.length ?? 0} na fila</strong></div>
            <div className="metric"><svg viewBox="0 0 24 24"><path d="M12 2 5 9h4v6h6V9h4l-7-7Z"/></svg><strong>{bootstrap?.onlinePlayers.length ?? 0} jogadores online</strong></div>
            <div className="tool-buttons admin-tool-buttons">
              <button className="ranking-button" type="button" onClick={handleRelease} disabled={releaseState === "loading" || resetState === "loading"}>{releaseState === "loading" ? "Salvando..." : bootstrap?.gameActive ? "Desativar jogo" : "Ativar jogo"}</button>
              <button className="ranking-button ranking-button--danger" type="button" onClick={handleReset} disabled={resetState === "loading" || releaseState === "loading"}>{resetState === "loading" ? "Resetando..." : "Resetar jogo"}</button>
            </div>
          </div>

          <div className="board-shell admin-board-grid">
            <section className="admin-column">
              <div className="tray-heading"><strong>Fila de espera</strong><span>Quem entra agora aguarda aqui</span></div>
              <div className="live-leaderboard admin-list-scroll">
                {(bootstrap?.waitingPlayers ?? []).length === 0 ? <div className="ranking-empty">Sem jogadores aguardando.</div> : (bootstrap?.waitingPlayers ?? []).map((player) => (
                  <article key={player.id} className="live-row admin-waiting-row"><img src={player.avatarUrl} alt={player.nickname} /><div><strong>{player.nickname}</strong><span>Esperando próxima largada</span></div></article>
                ))}
              </div>
            </section>

            <section className="admin-column highlight-column">
              <div className="tray-heading"><strong>Rodada atual</strong><span>{bootstrap?.currentRound ? bootstrap.currentRound.status : "Sem rodada ativa"}</span></div>
              <div className="round-hero">
                {bootstrap?.currentRound ? (
                  <>
                    <p className="kicker">Arena em andamento</p>
                    <h2>{bootstrap.currentRound.status === "countdown" ? "Contagem regressiva" : "Corrida ao vivo"}</h2>
                    <p>{bootstrap.currentRound.status === "countdown" ? "Os jogadores liberados já receberam a contagem sincronizada." : "Os jogadores estão jogando!"}</p>
                  </>
                ) : (
                  <>
                    <p className="kicker">Lobby fechado</p>
                    <h2>Aguardando próxima rodada</h2>
                    <p>Clique em liberar quando quiser mandar todo o lote atual para a largada.</p>
                  </>
                )}
              </div>
              <div className="live-leaderboard admin-list-scroll">
                {(bootstrap?.currentRound?.participants ?? []).length === 0 ? <div className="ranking-empty">Nenhum participante ativo.</div> : (bootstrap?.currentRound?.participants ?? []).map((player, index) => (
                  <article key={player.sessionId} className="live-row"><span className="ranking-position mini">{index + 1}</span><img src={player.avatarUrl} alt={player.nickname} /><div><strong>{player.nickname}</strong><span>{player.isFinished ? `Finalizou em ${formatTime(player.elapsedMs)}` : `${player.levelsCompleted}/5 fases • ${Math.round(player.progressPercent)}%`}</span></div></article>
                ))}
              </div>
            </section>

            <section className="admin-column">
              <div className="tray-heading"><strong>Pódio geral</strong><span>Ranking permanente</span></div>
              <div className="ranking-list embed-ranking-list admin-list-scroll">
                {(bootstrap?.rankings ?? []).slice(0, 12).map((entry, index) => (
                  <div key={entry.id} className="ranking-item compact-ranking-item"><span className="ranking-position">{index + 1}</span><div><div className="ranking-name">{entry.nickname}</div><div className="ranking-meta">{entry.totalMoves} mov.</div></div><span className="ranking-time">{formatTime(entry.totalTimeMs)}</span></div>
                ))}
              </div>
            </section>
          </div>
          {error && <div className="admin-error-strip">{error}</div>}
        </section>
      </section>
    </main>
  );
}
