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
    scale: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  };
  components?: {
    material?: {
      data?: { color?: string };
      attrValue?: string;
      setAttribute?: (attr: string, value: string) => void;
    };
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
  shape: "box" | "sphere" | "cylinder";
};

type Star = {
  id: string;
  laneX: number;
  size: number;
  z: number;
};

type Pyramid = {
  id: string;
  laneX: number;
  size: number;
  z: number;
};

type Projectile = {
  id: string;
  x: number;
  z: number;
  radius: number;
};

const LANES = [-2.4, 0, 2.4] as const;

const PLAYER_Y_BASE = 1.0;
const PLAYER_Z = -6.0;
const PLAYER_RADIUS = 0.65;
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

const PYRAMID_Y = 1.0;
const PYRAMID_SPAWN_Z = -40;
const PYRAMID_DESPAWN_Z = 6;
const PYRAMID_SIZE = 0.8;
const PYRAMID_AMMO_BONUS = 6;
const START_AMMO = 12;

const SPAWN_EVERY_MS = 900;
const BASE_SPEED = 4.5;
const SPEED_RAMP_PER_SEC = 0.12;

const MAX_LIVES = 5;
const HIT_COOLDOWN_SEC = 0.3;

const JUMP_DURATION = 0.4;
const JUMP_HEIGHT = 2.5;

const PLAYER_COLOR_NORMAL = "#4affff";
const PLAYER_COLOR_HIT = "#ffffff";
const OBSTACLE_COLOR = "#ff44cc";
const STAR_COLOR = "#ffdd77";
const PROJECTILE_COLOR = "#ff3333";
const PYRAMID_COLOR = "#33ff55"; 

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
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
  const [micStatus, setMicStatus] = useState("Micrófono desactivado. Actívalo para jugar.");
  const [gameStatus, setGameStatus] = useState<"Esperando" | "Jugando" | "Game Over">("Esperando");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [ammo, setAmmo] = useState(START_AMMO); 
  const ammoRef = useRef(START_AMMO);           

  const [lastCommand, setLastCommand] = useState("-");
  const [lastTranscript, setLastTranscript] = useState("-");

  const gameStatusRef = useRef(gameStatus);
  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  const obstaclesRef = useRef<Obstacle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const pyramidsRef = useRef<Pyramid[]>([]); 
  const projectilesRef = useRef<Projectile[]>([]);
  
  const [obstaclesVersion, setObstaclesVersion] = useState(0);
  const [starsVersion, setStarsVersion] = useState(0);
  const [pyramidsVersion, setPyramidsVersion] = useState(0); 
  const [projectilesVersion, setProjectilesVersion] = useState(0);
  
  const obstaclesVersionRef = useRef(obstaclesVersion);
  const starsVersionRef = useRef(starsVersion);
  const pyramidsVersionRef = useRef(pyramidsVersion);
  const projectilesVersionRef = useRef(projectilesVersion);
  
  useEffect(() => { obstaclesVersionRef.current = obstaclesVersion; }, [obstaclesVersion]);
  useEffect(() => { starsVersionRef.current = starsVersion; }, [starsVersion]);
  useEffect(() => { pyramidsVersionRef.current = pyramidsVersion; }, [pyramidsVersion]);
  useEffect(() => { projectilesVersionRef.current = projectilesVersion; }, [projectilesVersion]);

  const obstacleElsRef = useRef(new Map<string, HTMLElement>());
  const starElsRef = useRef(new Map<string, HTMLElement>());
  const pyramidElsRef = useRef(new Map<string, HTMLElement>()); 
  const playerElRef = useRef<AFrameEntity | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number | null>(null);
  const spawnTimerMsRef = useRef(0);
  const starSpawnTimerMsRef = useRef(0);
  const pyramidSpawnTimerMsRef = useRef(0); 
  const aliveSecondsRef = useRef(0);
  const hitCooldownRef = useRef(0);

  const playerTargetXRef = useRef(0);
  const playerXRef = useRef(0);

  const vibrationTimeoutRef = useRef<number | null>(null);
  const colorTimeoutRef = useRef<number | null>(null);
  const jumpTimeRemainingRef = useRef(0);
  const shootCooldownRef = useRef(0);

  const lastVoiceCommandTimeRef = useRef(0);

  const supportsSpeech =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const laneBounds = useMemo(() => {
    const minX = Math.min(...LANES);
    const maxX = Math.max(...LANES);
    return { minX, maxX };
  }, []);

  const applyHitEffect = () => {
    const player = playerElRef.current;
    if (!player) return;

    if (vibrationTimeoutRef.current) {
      window.clearTimeout(vibrationTimeoutRef.current);
      vibrationTimeoutRef.current = null;
    }

    if (player.object3D) {
      player.object3D.scale.set(1.35, 1.35, 1.35);
      vibrationTimeoutRef.current = window.setTimeout(() => {
        if (player.object3D) {
          player.object3D.scale.set(1, 1, 1);
        }
        vibrationTimeoutRef.current = null;
      }, 120);
    } else {
      player.setAttribute("scale", "1.35 1.35 1.35");
      vibrationTimeoutRef.current = window.setTimeout(() => {
        if (player && player.isConnected) {
          player.setAttribute("scale", "1 1 1");
        }
        vibrationTimeoutRef.current = null;
      }, 120);
    }

    if (colorTimeoutRef.current) {
      window.clearTimeout(colorTimeoutRef.current);
      colorTimeoutRef.current = null;
    }

    const setPlayerColor = (color: string) => {
      player.setAttribute("material", `color: ${color}; emissive: #00aaff; metalness: 0.8; roughness: 0.2`);
    };

    setPlayerColor(PLAYER_COLOR_HIT);
    colorTimeoutRef.current = window.setTimeout(() => {
      setPlayerColor(PLAYER_COLOR_NORMAL);
      colorTimeoutRef.current = null;
    }, 120);
  };

  const performJump = () => {
    if (gameStatusRef.current !== "Jugando") return;
    if (jumpTimeRemainingRef.current > 0) return;
    jumpTimeRemainingRef.current = JUMP_DURATION;
    setLastCommand("saltar");
    setMicStatus("Saltaste!");
  };

  const shootProjectile = () => {
    if (gameStatusRef.current !== "Jugando") return;
    if (shootCooldownRef.current > 0) return;

    if (ammoRef.current <= 0) {
      setMicStatus("Necesitas proyectiles");
      return;
    }

    ammoRef.current -= 1;
    setAmmo(ammoRef.current);

    const playerX = playerXRef.current;
    const id = `proj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    projectilesRef.current.push({
      id,
      x: playerX,
      z: PLAYER_Z - 0.5,
      radius: 0.2,
    });
    setProjectilesVersion(v => v + 1);
    shootCooldownRef.current = 0.3;
    setLastCommand("disparo");
    setMicStatus("¡Disparaste!");
  };

  const executeCommand = (command: string) => {
    const now = Date.now();
    if (now - lastVoiceCommandTimeRef.current < 200) return; 
    lastVoiceCommandTimeRef.current = now;

    switch (command) {
      case "izquierda":
        {
          const laneIdx = pickLaneIndexFromX(playerTargetXRef.current);
          playerTargetXRef.current = LANES[Math.max(0, laneIdx - 1)];
          setLastCommand("izquierda");
          setMicStatus("Izquierda");
        }
        break;
      case "derecha":
        {
          const laneIdx = pickLaneIndexFromX(playerTargetXRef.current);
          playerTargetXRef.current = LANES[Math.min(LANES.length - 1, laneIdx + 1)];
          setLastCommand("derecha");
          setMicStatus("Derecha");
        }
        break;
      case "saltar":
        performJump();
        break;
      case "disparar":
        shootProjectile();
        break;
    }
  };

  const applyVoiceCommand = (transcript: string): string | null => {
    if (gameStatusRef.current !== "Jugando") return null;
    const normalized = normalizeSpeech(transcript);
    const executed: string[] = [];

    if (normalized.includes("saltar")) {
      executeCommand("saltar");
      executed.push("saltar");
    } else if (normalized.includes("izquierda")) {
      executeCommand("izquierda");
      executed.push("izquierda");
    } else if (normalized.includes("derecha")) {
      executeCommand("derecha");
      executed.push("derecha");
    } else if (normalized.includes("disparar") || normalized.includes("fuego")) {
      executeCommand("disparar");
      executed.push("disparar");
    }

    if (executed.length > 0) {
      setLastCommand(executed.join(", "));
      return executed.join(", ");
    }
    return null;
  };

  const resetGameState = () => {
    if (vibrationTimeoutRef.current) {
      window.clearTimeout(vibrationTimeoutRef.current);
      vibrationTimeoutRef.current = null;
    }
    if (colorTimeoutRef.current) {
      window.clearTimeout(colorTimeoutRef.current);
      colorTimeoutRef.current = null;
    }

    setScore(0);
    setLives(MAX_LIVES);
    ammoRef.current = START_AMMO;
    setAmmo(START_AMMO);
    setLastCommand("-");
    aliveSecondsRef.current = 0;
    spawnTimerMsRef.current = 0;
    starSpawnTimerMsRef.current = 0;
    pyramidSpawnTimerMsRef.current = 0; 
    lastFrameMsRef.current = null;
    hitCooldownRef.current = 0;
    jumpTimeRemainingRef.current = 0;
    shootCooldownRef.current = 0;
    lastVoiceCommandTimeRef.current = 0;

    obstaclesRef.current = [];
    starsRef.current = [];
    pyramidsRef.current = []; 
    projectilesRef.current = [];
    
    setObstaclesVersion(v => v + 1);
    setStarsVersion(v => v + 1);
    setPyramidsVersion(v => v + 1);
    setProjectilesVersion(v => v + 1);
    
    obstacleElsRef.current.clear();
    starElsRef.current.clear();
    pyramidElsRef.current.clear();

    playerTargetXRef.current = 0;
    playerXRef.current = 0;
    const playerEl = playerElRef.current;
    if (playerEl?.object3D) {
      playerEl.object3D.position.x = 0;
      playerEl.object3D.position.y = PLAYER_Y_BASE;
      playerEl.object3D.position.z = PLAYER_Z;
      playerEl.object3D.scale.set(1, 1, 1);
      playerEl.setAttribute("material", `color: ${PLAYER_COLOR_NORMAL}; emissive: #00aaff; metalness: 0.8; roughness: 0.2`);
    }
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
      recognition.interimResults = true;
      recognition.lang = "es-MX";

      recognition.onresult = (event: RecognitionResultEvent) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) {
            transcript = result[0]?.transcript?.trim() ?? "";
            if (transcript) {
              setLastTranscript(transcript);
              const executed = applyVoiceCommand(transcript);
              if (executed) setMicStatus(`Comando aplicado: ${executed}`);
            }
          }
        }
      };

      recognition.onerror = (event: { error?: string }) => {
        const errorCode = event.error ?? "desconocido";

        if (errorCode === "not-allowed") {
          setMicStatus("Permiso denegado. Habilita el micrófono en el navegador.");
          micActiveRef.current = false;
          setMicEnabled(false);
          setGameStatus("Esperando");
          return;
        }

        if (errorCode === "audio-capture") {
          setMicStatus("No se encontró un micrófono disponible.");
          return;
        }

        if (errorCode === "no-speech") {
          setMicStatus("No detecté voz. Intenta hablar más cerca del micrófono.");
          return;
        }

        if (errorCode === "network") {
          if (!micActiveRef.current) return;

          micRetryAttemptRef.current += 1;
          const delayMs = Math.min(12000, 700 * 2 ** (micRetryAttemptRef.current - 1));
          setMicStatus(
            `Conexión inestable con reconocimiento de voz (network). Reintentando en ${(delayMs / 1000).toFixed(1)}s...`,
          );

          if (micRetryTimeoutRef.current) window.clearTimeout(micRetryTimeoutRef.current);
          micRetryTimeoutRef.current = window.setTimeout(() => {
            if (!micActiveRef.current || !recognitionRef.current) return;
            try {
              recognitionRef.current.start();
              setMicStatus("Escuchando comandos de voz...");
            } catch {
              // silencioso en error
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
          setMicStatus("No pude reiniciar el micrófono. Presiona activar nuevamente.");
          micActiveRef.current = false;
          setMicEnabled(false);
          setGameStatus("Esperando");
        }
      };

      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
      micActiveRef.current = true;
      setMicEnabled(true);
      setGameStatus("Jugando");
      setMicStatus("Escuchando comandos de voz...");
      resetGameState();
    } catch {
      setMicStatus("No pude iniciar el micrófono. Intenta de nuevo.");
      micActiveRef.current = false;
      setMicEnabled(false);
      setGameStatus("Esperando");
    }
  };

  const stopMicrophone = () => {
    micActiveRef.current = false;
    setMicEnabled(false);
    setGameStatus("Esperando");
    setMicStatus("Micrófono desactivado. Actívalo para jugar.");
    micRetryAttemptRef.current = 0;
    if (micRetryTimeoutRef.current) {
      window.clearTimeout(micRetryTimeoutRef.current);
      micRetryTimeoutRef.current = null;
    }
    recognitionRef.current?.stop();
  };

  const resetGame = () => {
    resetGameState();
    if (micEnabled) {
      setGameStatus("Jugando");
      setMicStatus("Juego reiniciado. ¡Sigue jugando!");
    } else {
      setGameStatus("Esperando");
      setMicStatus("Micrófono desactivado. Actívalo para jugar.");
    }
  };

  useEffect(() => {
    if (!aframeLoaded) return;

    const step = (nowMs: number) => {
      animationFrameRef.current = requestAnimationFrame(step);

      if (!micEnabled || gameStatus !== "Jugando") {
        lastFrameMsRef.current = nowMs;
        return;
      }

      const last = lastFrameMsRef.current ?? nowMs;
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
      lastFrameMsRef.current = nowMs;

      hitCooldownRef.current = Math.max(0, hitCooldownRef.current - dt);
      shootCooldownRef.current = Math.max(0, shootCooldownRef.current - dt);
      aliveSecondsRef.current += dt;
      setScore(Math.floor(aliveSecondsRef.current * 10));

      const speed = BASE_SPEED + aliveSecondsRef.current * SPEED_RAMP_PER_SEC;

      let jumpOffsetY = 0;
      if (jumpTimeRemainingRef.current > 0) {
        const t = (JUMP_DURATION - jumpTimeRemainingRef.current) / JUMP_DURATION;
        const peak = JUMP_HEIGHT;
        if (t <= 0.5) {
          const p = t / 0.5;
          jumpOffsetY = peak * (2 * p - p * p);
        } else {
          const p = (t - 0.5) / 0.5;
          jumpOffsetY = peak * (1 - (2 * p - p * p));
        }
        jumpTimeRemainingRef.current -= dt;
        if (jumpTimeRemainingRef.current <= 0) {
          jumpTimeRemainingRef.current = 0;
          jumpOffsetY = 0;
        }
      }

      // Spawn obstáculos
      spawnTimerMsRef.current += dt * 1000;
      if (spawnTimerMsRef.current >= SPAWN_EVERY_MS) {
        spawnTimerMsRef.current = 0;
        const laneX = LANES[Math.floor(Math.random() * LANES.length)];
        const size = OBSTACLE_MIN_SIZE + Math.random() * (OBSTACLE_MAX_SIZE - OBSTACLE_MIN_SIZE);
        const shapes: ("box" | "sphere" | "cylinder")[] = ["box", "sphere", "cylinder"];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const id = `${nowMs.toFixed(0)}-${Math.random().toString(16).slice(2)}`;
        obstaclesRef.current.push({ id, laneX, size, z: OBSTACLE_SPAWN_Z, shape });
        setObstaclesVersion(v => v + 1);
      }

      // Spawn estrellas (Vidas)
      starSpawnTimerMsRef.current += dt * 1000;
      if (starSpawnTimerMsRef.current >= 2600) {
        starSpawnTimerMsRef.current = 0;
        if (Math.random() < 0.8) {
          const laneX = LANES[Math.floor(Math.random() * LANES.length)];
          const id = `s-${nowMs.toFixed(0)}-${Math.random().toString(16).slice(2)}`;
          starsRef.current.push({ id, laneX, size: STAR_SIZE, z: STAR_SPAWN_Z });
          setStarsVersion(v => v + 1);
        }
      }

      // Spawn pirámides (Munición)
      pyramidSpawnTimerMsRef.current += dt * 1000;
      if (pyramidSpawnTimerMsRef.current >= 4500) {
        pyramidSpawnTimerMsRef.current = 0;
        if (Math.random() < 0.7) { 
          const laneX = LANES[Math.floor(Math.random() * LANES.length)];
          const id = `p-${nowMs.toFixed(0)}-${Math.random().toString(16).slice(2)}`;
          pyramidsRef.current.push({ id, laneX, size: PYRAMID_SIZE, z: PYRAMID_SPAWN_Z });
          setPyramidsVersion(v => v + 1);
        }
      }

      // Movimiento jugador
      const playerEl = playerElRef.current;
      if (playerEl?.object3D) {
        const target = Math.min(laneBounds.maxX, Math.max(laneBounds.minX, playerTargetXRef.current));
        const curr = playerXRef.current;
        const t = 1 - Math.exp(-PLAYER_SMOOTHING * dt);
        const next = curr + (target - curr) * t;
        playerXRef.current = next;
        playerEl.object3D.position.x = next;
        playerEl.object3D.position.y = PLAYER_Y_BASE + jumpOffsetY;
        playerEl.object3D.position.z = PLAYER_Z;
      }

      const playerX = playerXRef.current;
      const playerHalf = PLAYER_RADIUS;

      let hitOccurred = false;
      let starCollected = false;
      let pyramidCollected = false;

      // Proyectiles y colisión con obstáculos
      const newProjectiles: Projectile[] = [];
      const destroyedObstacleIds = new Set<string>();

      for (const proj of projectilesRef.current) {
        const newZ = proj.z - 12 * dt;
        let hit = false;

        for (const obs of obstaclesRef.current) {
          if (destroyedObstacleIds.has(obs.id)) continue;
          const obsHalf = obs.size / 2;
          const dx = Math.abs(obs.laneX - proj.x);
          const dz = Math.abs(newZ - obs.z);
          const dy = Math.abs(OBSTACLE_Y - PLAYER_Y_BASE);
          const radiusSum = proj.radius + obsHalf;
          if (dx <= radiusSum && dz <= radiusSum && dy <= radiusSum) {
            hit = true;
            destroyedObstacleIds.add(obs.id);
            break;
          }
        }

        if (!hit && newZ > OBSTACLE_SPAWN_Z - 2) {
          newProjectiles.push({ ...proj, z: newZ });
        }
      }

      if (destroyedObstacleIds.size > 0) {
        obstaclesRef.current = obstaclesRef.current.filter(obs => !destroyedObstacleIds.has(obs.id));
        setObstaclesVersion(v => v + 1);
      }
      projectilesRef.current = newProjectiles;
      if (projectilesRef.current.length !== projectilesVersionRef.current) {
        setProjectilesVersion(v => v + 1);
      }

      // Colisiones - Obstáculos
      const newObstacles: Obstacle[] = [];
      for (const o of obstaclesRef.current) {
        const newZ = o.z + speed * dt;
        const el = obstacleElsRef.current.get(o.id) as AFrameEntity | undefined;
        if (el?.object3D) el.object3D.position.z = newZ;

        if (newZ <= OBSTACLE_DESPAWN_Z) {
          const half = o.size / 2;
          const dz = Math.abs(newZ - PLAYER_Z);
          const dx = Math.abs(o.laneX - playerX);
          const dy = Math.abs(OBSTACLE_Y - (PLAYER_Y_BASE + jumpOffsetY));
          const radiusSum = playerHalf + half;
          const colliding = (dx <= radiusSum && dz <= radiusSum && dy <= radiusSum);

          if (colliding && !hitOccurred && hitCooldownRef.current <= 0) {
            hitOccurred = true;
          } else {
            newObstacles.push({ ...o, z: newZ });
          }
        }
      }
      obstaclesRef.current = newObstacles;

      // Colisiones - Estrellas
      const newStars: Star[] = [];
      for (const s of starsRef.current) {
        const newZ = s.z + speed * dt;
        const el = starElsRef.current.get(s.id) as AFrameEntity | undefined;
        if (el?.object3D) el.object3D.position.z = newZ;

        if (newZ <= STAR_DESPAWN_Z) {
          const half = s.size / 2;
          const dz = Math.abs(newZ - PLAYER_Z);
          const dx = Math.abs(s.laneX - playerX);
          const dy = Math.abs(STAR_Y - (PLAYER_Y_BASE + jumpOffsetY));
          const radiusSum = playerHalf + half;
          const colliding = (dx <= radiusSum && dz <= radiusSum && dy <= radiusSum);

          if (colliding && !hitOccurred && !starCollected && hitCooldownRef.current <= 0) {
            starCollected = true;
          } else {
            newStars.push({ ...s, z: newZ });
          }
        }
      }
      starsRef.current = newStars;

      // Colisiones - Pirámides
      const newPyramids: Pyramid[] = [];
      for (const p of pyramidsRef.current) {
        const newZ = p.z + speed * dt;
        const el = pyramidElsRef.current.get(p.id) as AFrameEntity | undefined;
        if (el?.object3D) el.object3D.position.z = newZ;

        if (newZ <= PYRAMID_DESPAWN_Z) {
          const half = p.size / 2;
          const dz = Math.abs(newZ - PLAYER_Z);
          const dx = Math.abs(p.laneX - playerX);
          const dy = Math.abs(PYRAMID_Y - (PLAYER_Y_BASE + jumpOffsetY));
          const radiusSum = playerHalf + half;
          const colliding = (dx <= radiusSum && dz <= radiusSum && dy <= radiusSum);

          if (colliding && !hitOccurred && !pyramidCollected && hitCooldownRef.current <= 0) {
            pyramidCollected = true;
          } else {
            newPyramids.push({ ...p, z: newZ });
          }
        }
      }
      pyramidsRef.current = newPyramids;

      // Efectos según colisión
      if (hitCooldownRef.current <= 0) {
        if (hitOccurred) {
          hitCooldownRef.current = HIT_COOLDOWN_SEC;
          applyHitEffect();
          setLives(prev => {
            const newLives = Math.max(0, prev - 1);
            if (newLives === 0) {
              setGameStatus("Game Over");
              setMicStatus("¡Game Over! Perdiste todas tus vidas.");
              stopMicrophone();
            } else {
              setMicStatus(`¡Choque! Te quedan ${newLives} vidas.`);
            }
            return newLives;
          });
        } else if (starCollected) {
          hitCooldownRef.current = HIT_COOLDOWN_SEC;
          setLives(prev => Math.min(MAX_LIVES, prev + 1));
          setMicStatus("¡Recogiste una estrella! +1 vida.");
        } else if (pyramidCollected) {
          hitCooldownRef.current = HIT_COOLDOWN_SEC;
          ammoRef.current += PYRAMID_AMMO_BONUS;
          setAmmo(ammoRef.current);
          setMicStatus(`¡Recogiste una pirámide! +${PYRAMID_AMMO_BONUS} proyectiles.`);
        }
      }

      if (obstaclesRef.current.length !== obstaclesVersionRef.current) {
        setObstaclesVersion(v => v + 1);
      }
      if (starsRef.current.length !== starsVersionRef.current) {
        setStarsVersion(v => v + 1);
      }
      if (pyramidsRef.current.length !== pyramidsVersionRef.current) {
        setPyramidsVersion(v => v + 1);
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [aframeLoaded, gameStatus, micEnabled, laneBounds.maxX, laneBounds.minX]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        shootProjectile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      micActiveRef.current = false;
      if (micRetryTimeoutRef.current) {
        window.clearTimeout(micRetryTimeoutRef.current);
        micRetryTimeoutRef.current = null;
      }
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (vibrationTimeoutRef.current) {
        window.clearTimeout(vibrationTimeoutRef.current);
        vibrationTimeoutRef.current = null;
      }
      if (colorTimeoutRef.current) {
        window.clearTimeout(colorTimeoutRef.current);
        colorTimeoutRef.current = null;
      }
    };
  }, []);

  const renderObstacle = (o: Obstacle) => {
    let geometryStr = "";
    switch (o.shape) {
      case "box":
        geometryStr = `primitive: box; width: ${o.size}; height: ${o.size}; depth: ${o.size}`;
        break;
      case "sphere":
        geometryStr = `primitive: sphere; radius: ${o.size / 2}`;
        break;
      case "cylinder":
        geometryStr = `primitive: cylinder; radius: ${o.size / 2}; height: ${o.size}`;
        break;
    }

    return (
      <a-entity
        key={o.id}
        ref={(el: HTMLElement | null) => {
          if (el) obstacleElsRef.current.set(o.id, el);
          else obstacleElsRef.current.delete(o.id);
        }}
        position={`${o.laneX} ${OBSTACLE_Y} ${o.z}`}
        geometry={geometryStr}
        material={`color: ${OBSTACLE_COLOR}; emissive: #ff2299; metalness: 0.5; roughness: 0.3`}
      />
    );
  };

  const renderProjectile = (p: Projectile) => (
    <a-entity
      key={p.id}
      position={`${p.x} ${PLAYER_Y_BASE} ${p.z}`}
      geometry="primitive: sphere; radius: 0.2"
      material={`color: ${PROJECTILE_COLOR}; emissive: #ff0000; metalness: 0.2; roughness: 0.1`}
    />
  );

  const obstaclesToRender = obstaclesRef.current;
  const starsToRender = starsRef.current;
  const pyramidsToRender = pyramidsRef.current;
  const projectilesToRender = projectilesRef.current;

  return (
    <>
      <Script
        src="https://aframe.io/releases/1.7.0/aframe.min.js"
        strategy="afterInteractive"
        onLoad={() => setAframeLoaded(true)}
      />

      {aframeLoaded ? (
        <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
          <a-scene
            embedded
            renderer="antialias: true; colorManagement: true"
            fog="type: exponential; color: #120c2c; density: 0.04"
            style={{ width: "100%", height: "100%" }}
          >
            <a-assets></a-assets>
            <a-sky color="#120c2c"></a-sky>

            <a-entity light="type: ambient; intensity: 0.4; color: #6644aa"></a-entity>
            <a-entity
              light="type: directional; intensity: 1.2; color: #ffaa88"
              position="6 10 6"
            ></a-entity>
            <a-entity
              light="type: point; intensity: 0.9; color: #ff44aa; distance: 12; decay: 1"
              position="0 3 0"
            ></a-entity>
            <a-entity
              light="type: point; intensity: 0.7; color: #44aaff; distance: 14; decay: 1"
              position="-3 4 2"
            ></a-entity>

            <a-plane
              position="0 0 -10"
              rotation="-90 0 0"
              width="26"
              height="120"
              material="color: #221133; metalness: 0.4; roughness: 0.6"
            ></a-plane>

            <a-entity
              id="player"
              ref={(el: AFrameEntity | null) => {
                playerElRef.current = el;
              }}
              position={`0 ${PLAYER_Y_BASE} ${PLAYER_Z}`}
              geometry={`primitive: sphere; radius: ${PLAYER_RADIUS}`}
              material={`color: ${PLAYER_COLOR_NORMAL}; emissive: #00aaff; metalness: 0.8; roughness: 0.2`}
            ></a-entity>

            {obstaclesToRender.map(o => renderObstacle(o))}
            {starsToRender.map(s => (
              <a-entity
                key={s.id}
                ref={(el: HTMLElement | null) => {
                  if (el) starElsRef.current.set(s.id, el);
                  else starElsRef.current.delete(s.id);
                }}
                position={`${s.laneX} ${STAR_Y} ${s.z}`}
                geometry="primitive: octahedron; radius: 0.6"
                material={`color: ${STAR_COLOR}; emissive: #ffaa33; metalness: 0.2; roughness: 0.1`}
                animation="property: rotation; to: 0 360 0; loop: true; dur: 1000; easing: linear"
              ></a-entity>
            ))}
            
            {pyramidsToRender.map(p => (
              <a-entity
                key={p.id}
                ref={(el: HTMLElement | null) => {
                  if (el) pyramidElsRef.current.set(p.id, el);
                  else pyramidElsRef.current.delete(p.id);
                }}
                position={`${p.laneX} ${PYRAMID_Y} ${p.z}`}
                geometry={`primitive: cone; radiusBottom: ${p.size / 2}; radiusTop: 0; segmentsRadial: 4`}
                material={`color: ${PYRAMID_COLOR}; emissive: #11aa33; metalness: 0.3; roughness: 0.2`}
                animation="property: rotation; to: 0 360 0; loop: true; dur: 1500; easing: linear"
              ></a-entity>
            ))}

            {projectilesToRender.map(p => renderProjectile(p))}

            <a-entity camera look-controls position="0 2.2 0"></a-entity>
          </a-scene>

          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              width: "min(92vw, 440px)",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(12, 8, 32, 0.85)",
              color: "#e0e0ff",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
              zIndex: 10,
            }}
            className="principal"
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
                  transition: "all 0.2s",
                }}
              >
                {micEnabled ? "Apagar micrófono" : "Activar micrófono"}
              </button>

              <button
                type="button"
                onClick={resetGame}
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  background: "rgba(255,255,255,0.1)",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Reiniciar
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Estado</span>
                <strong style={{ color: gameStatus === "Jugando" ? "#86efac" : "#fecaca" }}>
                  {gameStatus === "Esperando" ? "Esperando micrófono" : gameStatus}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Vidas</span>
                <strong style={{ color: "#ff6a6a" }}>
                  {Array.from({ length: MAX_LIVES }, (_, i) => (i < lives ? "❤" : "♡")).join(" ")}
                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>({lives})</span>
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Proyectiles</span>
                <strong style={{ color: ammo > 0 ? "#60a5fa" : "#fca5a5" }}>
                  {ammo}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Puntuación</span>
                <strong>{score}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.85 }}>Último comando</span>
                <strong>{lastCommand}</strong>
              </div>
            </div>

            <p style={{ margin: "10px 0 6px", color: ammo === 0 ? "#ff9999" : "inherit" }}>{micStatus}</p>
            <p style={{ margin: "6px 0", fontSize: 13 }}>Último texto: {lastTranscript}</p>
            <p style={{ margin: "6px 0", fontSize: 12, opacity: 0.9 }}>
              Di: <strong>izquierda</strong>, <strong>derecha</strong>, <strong>saltar</strong> o <strong>disparar</strong>.
              También puedes presionar la tecla <strong>W</strong> para disparar.
              {!micEnabled && " Activa el micrófono para comenzar."}
            </p>

            {/* MODIFICACIÓN: Mensaje de Game Over dentro del panel principal */}
            {lives === 0 && (
              <div style={{
                marginTop: 12,
                padding: "12px",
                background: "rgba(255, 50, 100, 0.9)",
                borderRadius: 8,
                textAlign: "center",
                border: "1px solid #ff99aa"
              }}>
                <div style={{ fontWeight: "bold", fontSize: "1.3rem", marginBottom: 8 }}>💀 GAME OVER 💀</div>
                <button
                  onClick={resetGame}
                  style={{
                    background: "#ffffff",
                    border: "none",
                    padding: "6px 16px",
                    borderRadius: 20,
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: "1rem",
                    color: "#aa2244"
                  }}
                >
                  Da click para jugar de nuevo
                </button>
              </div>
            )}
          </div>

          {/* OVERLAY GAME OVER A PANTALLA COMPLETA */}
          {gameStatus === "Game Over" && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                backgroundColor: "rgba(10, 5, 20, 0.92)",
                backdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999, // Aseguramos que tape ABSOLUTAMENTE todo
                animation: "fadeIn 0.3s ease-out",
                fontFamily: "'Courier New', Courier, monospace", // Toque retro/pixel
              }}
            >
              <div
                style={{
                  background: "#110b1a",
                  padding: "50px 70px",
                  textAlign: "center",
                  border: "6px solid #ff3366",
                  boxShadow: "10px 10px 0px rgba(255, 51, 102, 0.4)", // Sombra estilo bloque/voxel
                }}
              >
                <h1
                  style={{
                    fontSize: "clamp(3rem, 8vw, 6rem)",
                    fontWeight: "900",
                    color: "#ff3366",
                    textShadow: "4px 4px 0px #550011",
                    letterSpacing: "4px",
                    margin: "0 0 20px 0",
                    textTransform: "uppercase",
                  }}
                >
                  Game Over
                </h1>
                
                <div style={{ marginBottom: "30px" }}>
                  <p style={{ fontSize: "1.5rem", color: "#ccc", margin: "0 0 10px 0" }}>
                    Tu aventura terminó.
                  </p>
                  <p style={{ fontSize: "2rem", color: "#4affff", margin: "0", fontWeight: "bold", textShadow: "2px 2px 0px #005555" }}>
                    PUNTUACIÓN FINAL: {score}
                  </p>
                </div>

                <button
                  onClick={resetGame}
                  style={{
                    background: "#ff3366",
                    border: "4px solid #fff",
                    padding: "16px 40px",
                    fontSize: "1.5rem",
                    fontWeight: "900",
                    color: "#fff",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "transform 0.1s",
                    boxShadow: "6px 6px 0px #881133",
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = "translate(4px, 4px)";
                    e.currentTarget.style.boxShadow = "2px 2px 0px #881133";
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = "translate(0, 0)";
                    e.currentTarget.style.boxShadow = "6px 6px 0px #881133";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translate(0, 0)";
                    e.currentTarget.style.boxShadow = "6px 6px 0px #881133";
                  }}
                >
                  Intentar de nuevo
                </button>
              </div>
              <style jsx>{`
                @keyframes fadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
              `}</style>
            </div>
          )}
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