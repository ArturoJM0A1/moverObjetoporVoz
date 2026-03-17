"use client";

import { useEffect } from "react";
import Script from "next/script";

export default function VRScene() {
  useEffect(() => {
    const AFRAME = (window as any).AFRAME;

    if (AFRAME && !AFRAME.components["voice-command"]) {
      AFRAME.registerComponent("voice-command", {
        init: function () {
          if ((this as any).speechRecognition) return;

          const el = this.el;

          const recognition = ((this as any).speechRecognition =
            new (window as any).webkitSpeechRecognition());

          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "es-ES";

          const commands: any = {
            izquierda: () => (el.object3D.position.x -= 1),
            derecha: () => (el.object3D.position.x += 1),
            arriba: () => (el.object3D.position.y += 1),
            abajo: () => (el.object3D.position.y -= 1),
            adelante: () => (el.object3D.position.z -= 1),
            atrás: () => (el.object3D.position.z += 1),
            azul: () => el.setAttribute("material", "color", "blue"),
            verde: () => el.setAttribute("material", "color", "green"),
          };

          recognition.onresult = function (event: any) {
            let text = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
              text = event.results[i][0].transcript.toLowerCase();
            }

            console.log("Texto:", text);

            for (const cmd in commands) {
              if (text.includes(cmd)) {
                commands[cmd]();
              }
            }
          };

          recognition.start();
        },

        remove: function () {
          const recognition = (this as any).speechRecognition;
          if (recognition) recognition.stop();
        },
      });
    }
  }, []);

  return (
    <>
      {/* Carga A-Frame desde CDN */}
      <Script
        src="https://aframe.io/releases/1.2.0/aframe.min.js"
        strategy="afterInteractive"
      />

      {/* Escena VR */}
      <a-scene embedded style={{ width: "100vw", height: "100vh" }}>
        <a-box position="0 0 0" material="color: red" voice-command></a-box>
        <a-entity camera position="0 0 9"></a-entity>
      </a-scene>
    </>
  );
}
