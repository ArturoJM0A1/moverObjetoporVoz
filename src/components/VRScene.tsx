"use client";

import { useEffect, useRef, useState } from "react";
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

type VoiceBoxElement = HTMLElement & {
  object3D?: {
    position: {
      x: number;
      y: number;
      z: number;
    };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const MOVE_STEP = 0.6;

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function applyVoiceCommand(boxEl: VoiceBoxElement | null, transcript: string): string | null {
  if (!boxEl?.object3D) {
    return null;
  }

  const normalized = normalizeSpeech(transcript);
  const executed: string[] = [];

  if (normalized.includes("izquierda")) {
    boxEl.object3D.position.x -= MOVE_STEP;
    executed.push("izquierda");
  }

  if (normalized.includes("derecha")) {
    boxEl.object3D.position.x += MOVE_STEP;
    executed.push("derecha");
  }

  if (normalized.includes("arriba")) {
    boxEl.object3D.position.y += MOVE_STEP;
    executed.push("arriba");
  }

  if (normalized.includes("abajo")) {
    boxEl.object3D.position.y -= MOVE_STEP;
    executed.push("abajo");
  }

  if (normalized.includes("adelante")) {
    boxEl.object3D.position.z -= MOVE_STEP;
    executed.push("adelante");
  }

  if (normalized.includes("atras")) {
    boxEl.object3D.position.z += MOVE_STEP;
    executed.push("atras");
  }

  if (normalized.includes("azul")) {
    boxEl.setAttribute("material", "color: #1d4ed8; metalness: 0.1; roughness: 0.45");
    executed.push("azul");
  }

  if (normalized.includes("verde")) {
    boxEl.setAttribute("material", "color: #16a34a; metalness: 0.1; roughness: 0.45");
    executed.push("verde");
  }

  if (normalized.includes("rojo")) {
    boxEl.setAttribute("material", "color: #ef4444; metalness: 0.1; roughness: 0.45");
    executed.push("rojo");
  }

  return executed.length > 0 ? executed.join(", ") : null;
}

export default function VRScene() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micActiveRef = useRef(false);

  const [aframeLoaded, setAframeLoaded] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micStatus, setMicStatus] = useState("Microfono apagado.");
  const [lastTranscript, setLastTranscript] = useState("-");
  const supportsSpeech =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      micActiveRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const stopMicrophone = () => {
    micActiveRef.current = false;
    setMicEnabled(false);
    setMicStatus("Microfono apagado.");
    recognitionRef.current?.stop();
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

        if (!transcript) {
          return;
        }

        setLastTranscript(transcript);

        const boxEl = document.getElementById("voz-box") as VoiceBoxElement | null;
        const executed = applyVoiceCommand(boxEl, transcript);

        if (executed) {
          setMicStatus(`Comando aplicado: ${executed}`);
        }
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

        setMicStatus(`Error de reconocimiento: ${errorCode}`);
      };

      recognition.onend = () => {
        if (!micActiveRef.current) {
          return;
        }

        try {
          recognition.start();
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
            background="color: #8ec9ff"
            style={{ width: "100%", height: "100%" }}
          >
            <a-entity light="type: ambient; intensity: 0.85"></a-entity>
            <a-entity light="type: directional; intensity: 1" position="2 4 1"></a-entity>
            <a-plane
              position="0 0 -4"
              rotation="-90 0 0"
              width="18"
              height="18"
              color="#71c282"
            ></a-plane>
            <a-box
              id="voz-box"
              position="0 1.4 -4"
              depth="1.4"
              height="1.4"
              width="1.4"
              material="color: #ef4444; metalness: 0.1; roughness: 0.45"
            ></a-box>
            <a-entity camera look-controls position="0 1.6 0"></a-entity>
          </a-scene>

          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              width: "min(90vw, 420px)",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(7, 20, 44, 0.72)",
              color: "#ecf4ff",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
            }}
          >
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

            <p style={{ margin: "10px 0 6px" }}>{micStatus}</p>
            <p style={{ margin: "6px 0", fontSize: 13 }}>Ultimo texto: {lastTranscript}</p>
            <p style={{ margin: "6px 0", fontSize: 12, opacity: 0.9 }}>
              Comandos: izquierda, derecha, arriba, abajo, adelante, atras, rojo, azul, verde.
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
            background: "#8ec9ff",
            color: "#03315d",
            fontFamily: "sans-serif",
          }}
        >
          Cargando escena VR...
        </div>
      )}
    </>
  );
}
