"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type AFrameEntity = HTMLElement & {
  object3D?: {
    position: { x: number; y: number; z: number };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Obstacle = {
  id: string;
  laneX: number;
  size: number;
  z: number;
};

type Star = {
  id: string;
  laneX: number;
  size: number;
  z: number;
};

const LANES = [-2.4, 0, 2.4] as const;

const PLAYER_Y = 1.0;
const PLAYER_Z = -6.0;
const PLAYER_SIZE = 1.3;
const PLAYER_SMOOTHING = 14;

const OBSTACLE_Y = 1.0;
const OBSTACLE_SPAWN_Z = -38;
const OBSTACLE_DESPAWN_Z = 6;
const OBSTACLE_MIN_SIZE = 1.0;
const OBSTACLE_MAX_SIZE = 1.8;

const STAR_Y = 1.2;
const STAR_SPAWN_Z = -40;
const STAR_DESPAWN_Z = 6;
const STAR_SIZE = 0.85;

const SPAWN_EVERY_MS = 900;
const BASE_SPEED = 6.5; // unidades/segundo
const SPEED_RAMP_PER_SEC = 0.22;

const MAX_LIVES = 5;
const HIT_COOLDOWN_SEC = 0.55;

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pickLaneIndexFromX(x: number) {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < LANES.length; i += 1) {
    const d = Math.abs(LANES[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export default function VRScene() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micActiveRef = useRef(false);
  const micRetryTimeoutRef = useRef<number | null>(null);
  const micRetryAttemptRef = useRef(0);

  const [aframeLoaded, setAframeLoaded] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micStatus, setMicStatus] = useState("Microfono apagado.");
  const [gameStatus, setGameStatus] = useState<"Jugando" | "Game Over">("Jugando");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [lastCommand, setLastCommand] = useState("-");
  const [lastTranscript, setLastTranscript] = useState("-");

  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [stars, setStars] = useState<Star[]>([]);

  const obstacleElsRef = useRef(new Map<string, HTMLElement>());
  const starElsRef = useRef(new Map<string, HTMLElement>());
  const playerElRef = useRef<AFrameEntity | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number | null>(null);
  const spawnTimerMsRef = useRef(0);
  const starSpawnTimerMsRef = useRef(0);
  const aliveSecondsRef = useRef(0);
  const hitCooldownRef = useRef(0);

  const playerTargetXRef = useRef(0);
  const playerXRef = useRef(0);

  const supportsSpeech =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const laneBounds = useMemo(() => {
    const minX = Math.min(...LANES);
    const maxX = Math.max(...LANES);
    return { minX, maxX };
  }, []);

  const resetGame = () => {
    setGameStatus("Jugando");
    setScore(0);
    setLives(MAX_LIVES);
    setLastCommand("-");

    aliveSecondsRef.current = 0;
    spawnTimerMsRef.current = 0;
    starSpawnTimerMsRef.current = 0;
    lastFrameMsRef.current = null;
    hitCooldownRef.current = 0;

    setObstacles([]);
    setStars([]);
    obstacleElsRef.current.clear();
    starElsRef.current.clear();

    playerTargetXRef.current = 0;
    playerXRef.current = 0;
    const playerEl = playerElRef.current;
    if (playerEl?.object3D) {
      playerEl.object3D.position.x = 0;
      playerEl.object3D.position.y = PLAYER_Y;
      playerEl.object3D.position.z = PLAYER_Z;
    }
    setMicStatus(micEnabled ? "Escuchando comandos de voz..." : "Microfono apagado.");
  };

  useEffect(() => {
    resetGame();
    return () => {
      micActiveRef.current = false;
      if (micRetryTimeoutRef.current) {
        window.clearTimeout(micRetryTimeoutRef.current);
        micRetryTimeoutRef.current = null;
      }
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMicrophone = () => {
    micActiveRef.current = false;
    setMicEnabled(false);
    setMicStatus("Microfono apagado.");
    micRetryAttemptRef.current = 0;
    if (micRetryTimeoutRef.current) {
      window.clearTimeout(micRetryTimeoutRef.current);
      micRetryTimeoutRef.current = null;
    }
    recognitionRef.current?.stop();
  };

  const jumpClearObstacles = () => {
    if (gameStatus !== "Jugando") return;
    setObstacles([]);
    obstacleElsRef.current.clear();
    setLastCommand("saltar");
    setMicStatus("Salto: obstaculos limpiados.");
  };

  const applyVoiceCommand = (transcript: string): string | null => {
    if (gameStatus !== "Jugando") return null;
    const normalized = normalizeSpeech(transcript);
    const executed: string[] = [];

    if (normalized.includes("saltar")) {
      setObstacles([]);
      obstacleElsRef.current.clear();
      executed.push("saltar");
    }

    if (normalized.includes("izquierda")) {
      const laneIdx = pickLaneIndexFromX(playerTargetXRef.current);
      playerTargetXRef.current = LANES[Math.max(0, laneIdx - 1)];
      executed.push("izquierda");
    }

    if (normalized.includes("derecha")) {
      const laneIdx = pickLaneIndexFromX(playerTargetXRef.current);
      playerTargetXRef.current = LANES[Math.min(LANES.length - 1, laneIdx + 1)];
      executed.push("derecha");
    }

    if (executed.length > 0) {
      setLastCommand(executed.join(", "));
      return executed.join(", ");
    }
    return null;
  };

  const startMicrophone = () => {
    const RecognitionCtor =
      (window.SpeechRecognition ?? window.webkitSpeechRecognition) as
        | SpeechRecognitionConstructor
        | undefined;

    if (!RecognitionCtor) {
      setMicStatus("Este navegador no soporta reconocimiento de voz.");
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new RecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "es-MX";

      recognition.onresult = (event: RecognitionResultEvent) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          transcript = event.results[i][0]?.transcript?.trim() ?? "";
        }
        if (!transcript) return;
        setLastTranscript(transcript);
        const executed = applyVoiceCommand(transcript);
        if (executed) setMicStatus(`Comando aplicado: ${executed}`);
      };

      recognition.onerror = (event: { error?: string }) => {
        const errorCode = event.error ?? "desconocido";

        if (errorCode === "not-allowed") {
          setMicStatus("Permiso denegado. Habilita el microfono en el navegador.");
          micActiveRef.current = false;
          setMicEnabled(false);
          return;
        }

        if (errorCode === "audio-capture") {
          setMicStatus("No se encontro un microfono disponible.");
          return;
        }

        if (errorCode === "no-speech") {
          setMicStatus("No detecte voz. Intenta hablar mas cerca del microfono.");
          return;
        }

        if (errorCode === "network") {
          if (!micActiveRef.current) {
            setMicStatus("Error de reconocimiento: network");
            return;
          }

          micRetryAttemptRef.current += 1;
          const delayMs = Math.min(12000, 700 * 2 ** (micRetryAttemptRef.current - 1));
          setMicStatus(
            `Conexion inestable con reconocimiento de voz (network). Reintentando en ${(delayMs / 1000).toFixed(1)}s...`,
          );

          if (micRetryTimeoutRef.current) window.clearTimeout(micRetryTimeoutRef.current);
          micRetryTimeoutRef.current = window.setTimeout(() => {
            if (!micActiveRef.current || !recognitionRef.current) return;
            try {
              recognitionRef.current.start();
              setMicStatus("Escuchando comandos de voz...");
            } catch {
              // onend/onerror volvera a disparar
            }
          }, delayMs);
          return;
        }

        setMicStatus(`Error de reconocimiento: ${errorCode}`);
      };

      recognition.onend = () => {
        if (!micActiveRef.current) return;
        try {
          recognition.start();
          micRetryAttemptRef.current = 0;
        } catch {
          setMicStatus("No pude reiniciar el microfono. Presiona activar nuevamente.");
          micActiveRef.current = false;
          setMicEnabled(false);
        }
      };

      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
      micActiveRef.current = true;
      setMicEnabled(true);
      setMicStatus("Escuchando comandos de voz...");
    } catch {
      setMicStatus("No pude iniciar el microfono. Intenta de nuevo.");
      micActiveRef.current = false;
      setMicEnabled(false);
    }
  };

  useEffect(() => {
    if (!aframeLoaded) return;

    const step = (nowMs: number) => {
      animationFrameRef.current = requestAnimationFrame(step);

      if (gameStatus !== "Jugando") {
        lastFrameMsRef.current = nowMs;
        return;
      }

      const last = lastFrameMsRef.current ?? nowMs;
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
      lastFrameMsRef.current = nowMs;

      hitCooldownRef.current = Math.max(0, hitCooldownRef.current - dt);

      aliveSecondsRef.current += dt;
      setScore(Math.floor(aliveSecondsRef.current * 10));

      const speed = BASE_SPEED + aliveSecondsRef.current * SPEED_RAMP_PER_SEC;

      // spawn obstacles
      spawnTimerMsRef.current += dt * 1000;
      if (spawnTimerMsRef.current >= SPAWN_EVERY_MS) {
        spawnTimerMsRef.current = 0;
        const laneX = LANES[Math.floor(Math.random() * LANES.length)];
        const size = OBSTACLE_MIN_SIZE + Math.random() * (OBSTACLE_MAX_SIZE - OBSTACLE_MIN_SIZE);
        const id = `${nowMs.toFixed(0)}-${Math.random().toString(16).slice(2)}`;
        setObstacles((prev) => [...prev, { id, laneX, size, z: OBSTACLE_SPAWN_Z }]);
      }

      // spawn stars
      starSpawnTimerMsRef.current += dt * 1000;
      if (starSpawnTimerMsRef.current >= 2600) {
        starSpawnTimerMsRef.current = 0;
        if (Math.random() < 0.8) {
          const laneX = LANES[Math.floor(Math.random() * LANES.length)];
          const id = `s-${nowMs.toFixed(0)}-${Math.random().toString(16).slice(2)}`;
          setStars((prev) => [...prev, { id, laneX, size: STAR_SIZE, z: STAR_SPAWN_Z }]);
        }
      }

      // smooth player
      const playerEl = playerElRef.current;
      if (playerEl?.object3D) {
        const target = Math.min(laneBounds.maxX, Math.max(laneBounds.minX, playerTargetXRef.current));
        const curr = playerXRef.current;
        const t = 1 - Math.exp(-PLAYER_SMOOTHING * dt);
        const next = curr + (target - curr) * t;
        playerXRef.current = next;
        playerEl.object3D.position.x = next;
        playerEl.object3D.position.y = PLAYER_Y;
        playerEl.object3D.position.z = PLAYER_Z;
      }

      const playerX = playerXRef.current;
      const playerHalf = PLAYER_SIZE / 2;

      let hitObstacleId: string | null = null;
      let pickedStarId: string | null = null;

      setObstacles((prev) => {
        const next: Obstacle[] = [];
        for (const o of prev) {
          const newZ = o.z + speed * dt;
          const el = obstacleElsRef.current.get(o.id) as AFrameEntity | undefined;
          if (el?.object3D) el.object3D.position.z = newZ;

          if (newZ <= OBSTACLE_DESPAWN_Z) {
            const half = o.size / 2;
            const dz = Math.abs(newZ - PLAYER_Z);
            const dx = Math.abs(o.laneX - playerX);
            const dy = Math.abs(OBSTACLE_Y - PLAYER_Y);
            if (dx <= playerHalf + half && dz <= playerHalf + half && dy <= playerHalf + half) {
              hitObstacleId = o.id;
            }
            next.push({ ...o, z: newZ });
          }
        }
        return next;
      });

      setStars((prev) => {
        const next: Star[] = [];
        for (const s of prev) {
          const newZ = s.z + speed * dt;
          const el = starElsRef.current.get(s.id) as AFrameEntity | undefined;
          if (el?.object3D) el.object3D.position.z = newZ;

          if (newZ <= STAR_DESPAWN_Z) {
            const half = s.size / 2;
            const dz = Math.abs(newZ - PLAYER_Z);
            const dx = Math.abs(s.laneX - playerX);
            const dy = Math.abs(STAR_Y - PLAYER_Y);
            if (dx <= playerHalf + half && dz <= playerHalf + half && dy <= playerHalf + half) {
              pickedStarId = s.id;
            } else {
              next.push({ ...s, z: newZ });
            }
          }
        }
        return next;
      });

      if (hitCooldownRef.current <= 0) {
        if (pickedStarId) {
          hitCooldownRef.current = HIT_COOLDOWN_SEC;
          starElsRef.current.delete(pickedStarId);
          setLives((l) => Math.min(MAX_LIVES, l + 1));
          setMicStatus("Recogiste una estrella: +1 vida.");
        } else if (hitObstacleId) {
          hitCooldownRef.current = HIT_COOLDOWN_SEC;
          obstacleElsRef.current.delete(hitObstacleId);
          setObstacles((prev) => prev.filter((o) => o.id !== hitObstacleId));
          setLives((l) => {
            const next = Math.max(0, l - 1);
            if (next <= 0) {
              setGameStatus("Game Over");
              setMicStatus("Game Over: perdiste tus 5 vidas.");
            } else {
              setMicStatus(`Choque: -1 vida. Te quedan ${next}.`);
            }
            return next;
          });
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [aframeLoaded, gameStatus, laneBounds.maxX, laneBounds.minX]);

  return (
    <>
      <Script
        src="https://aframe.io/releases/1.7.0/aframe.min.js"
        strategy="afterInteractive"
        onLoad={() => setAframeLoaded(true)}
      />

      {aframeLoaded ? (
        <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
          <a-scene
            embedded
            renderer="antialias: true; colorManagement: true"
            fog="type: exponential; color: #0b1020; density: 0.055"
            style={{ width: "100%", height: "100%" }}
          >
            <a-assets></a-assets>
            <a-sky color="#0b1020"></a-sky>
            <a-entity light="type: ambient; intensity: 0.65; color: #bcd7ff"></a-entity>
            <a-entity
              light="type: directional; intensity: 1.15; color: #ffffff"
              position="6 10 6"
            ></a-entity>
            <a-plane
              position="0 0 -10"
              rotation="-90 0 0"
              width="26"
              height="120"
              material="color: #0e1b2e; metalness: 0.05; roughness: 0.95"
            ></a-plane>

            <a-box
              id="voz-box"
              ref={(el: AFrameEntity | null) => {
                playerElRef.current = el;
              }}
              position={`0 ${PLAYER_Y} ${PLAYER_Z}`}
              depth={PLAYER_SIZE}
              height={PLAYER_SIZE}
              width={PLAYER_SIZE}
              material="color: #22c55e; emissive: #0b3d22; metalness: 0.15; roughness: 0.35"
            ></a-box>

            {obstacles.map((o) => (
              <a-box
                key={o.id}
                ref={(el: HTMLElement | null) => {
                  if (el) obstacleElsRef.current.set(o.id, el);
                  else obstacleElsRef.current.delete(o.id);
                }}
                position={`${o.laneX} ${OBSTACLE_Y} ${o.z}`}
                depth={o.size}
                height={o.size}
                width={o.size}
                material="color: #ef4444; emissive: #3b0606; metalness: 0.05; roughness: 0.55"
              ></a-box>
            ))}

            {stars.map((s) => (
              <a-entity
                key={s.id}
                ref={(el: HTMLElement | null) => {
                  if (el) starElsRef.current.set(s.id, el);
                  else starElsRef.current.delete(s.id);
                }}
                position={`${s.laneX} ${STAR_Y} ${s.z}`}
                geometry="primitive: octahedron; radius: 0.6"
                material="color: #facc15; emissive: #a16207; metalness: 0.15; roughness: 0.25"
                animation="property: rotation; to: 0 360 0; loop: true; dur: 1000; easing: linear"
              ></a-entity>
            ))}

            <a-entity camera look-controls position="0 1.6 0"></a-entity>
          </a-scene>

          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              width: "min(92vw, 440px)",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(7, 20, 44, 0.72)",
              color: "#ecf4ff",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
            }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={!supportsSpeech}
                onClick={micEnabled ? stopMicrophone : startMicrophone}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 12px",
                  background: micEnabled ? "#f97316" : "#16a34a",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: supportsSpeech ? "pointer" : "not-allowed",
                  opacity: supportsSpeech ? 1 : 0.6,
                }}
              >
                {micEnabled ? "Apagar microfono" : "Activar microfono"}
              </button>

              <button
                type="button"
                disabled={gameStatus !== "Jugando"}
                onClick={jumpClearObstacles}
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  background:
                    gameStatus === "Jugando" ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.06)",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: gameStatus === "Jugando" ? "pointer" : "not-allowed",
                  opacity: gameStatus === "Jugando" ? 1 : 0.7,
                }}
              >
                Saltar
              </button>

              <button
                type="button"
                onClick={resetGame}
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Reiniciar
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Estado</span>
                <strong style={{ color: gameStatus === "Jugando" ? "#86efac" : "#fecaca" }}>
                  {gameStatus}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Vidas</span>
                <strong>
                  {Array.from({ length: MAX_LIVES }, (_, i) => (i < lives ? "❤" : "♡")).join(" ")}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Puntuacion</span>
                <strong>{score}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Ultimo comando</span>
                <strong>{lastCommand}</strong>
              </div>
            </div>

            <p style={{ margin: "10px 0 6px" }}>{micStatus}</p>
            <p style={{ margin: "6px 0", fontSize: 13 }}>Ultimo texto: {lastTranscript}</p>
            <p style={{ margin: "6px 0", fontSize: 12, opacity: 0.9 }}>
              Di: <strong>izquierda</strong>, <strong>derecha</strong> o <strong>saltar</strong>{" "}
              (puede estar dentro de una frase).
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            width: "100vw",
            height: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#070a12",
            color: "#e6edf7",
            fontFamily: "sans-serif",
          }}
        >
          Cargando escena...
        </div>
      )}
    </>
  );
}
