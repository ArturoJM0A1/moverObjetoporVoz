"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const VRScene = dynamic(() => import("./VRScene"), {
  ssr: false,
});

export default function VRWrapper() {
  const [step, setStep] = useState("welcome"); // welcome | info | loading | vr
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---------------- LOADER ----------------
  useEffect(() => {
    if (step !== "loading" || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    let counter = 0;
    let particles: any[] = [];

    const w = 400;
    const h = 200;
    canvas.width = w;
    canvas.height = h;

    const particle_no = 30;

    const reset = () => {
      ctx.fillStyle = "#050507";
      ctx.fillRect(0, 0, w, h);

      ctx.shadowBlur = 20;
      ctx.shadowColor = "#00f0ff";
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(25, 80, 350, 25);
      ctx.shadowBlur = 0;
    };

    function progressbar(this: any) {
      this.widths = 0;
      this.hue = 290;

      this.draw = function () {
        ctx.shadowBlur = 25;
        ctx.shadowColor = `hsl(${this.hue}, 100%, 60%)`;

        ctx.fillStyle = `hsl(${this.hue}, 100%, 60%)`;
        ctx.fillRect(25, 80, this.widths, 25);

        ctx.shadowBlur = 0;
      };
    }

    function particle(this: any, bar: any) {
      this.x = 23 + bar.widths;
      this.y = 82;

      this.vx = 1 + Math.random() * 1.5;
      this.g = 1 + Math.random() * 2;
      this.down = false;

      this.draw = function () {
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00f0ff";

        ctx.fillStyle = "#00f0ff";
        ctx.fillRect(this.x, this.y, 2, 2);

        ctx.shadowBlur = 0;
      };
    }

    const bar: any = new (progressbar as any)();

    const update = () => {
      particles.forEach((p) => {
        p.x -= p.vx;

        if (p.down) {
          p.g += 0.1;
          p.y += p.g;
        } else {
          if (p.g < 0) p.down = true;
          p.y -= p.g;
          p.g -= 0.1;
        }

        p.draw();
      });
    };

    const draw = () => {
      reset();
      counter++;

      bar.hue += 0.8;
      bar.widths += 2;

      if (bar.widths > 350) {
        if (counter > 200) {
          setStep("vr");
        } else {
          bar.widths = 350;
        }
      } else {
        for (let i = 0; i < particle_no; i += 5) {
          particles.push(new (particle as any)(bar));
        }
      }

      bar.draw();
      update();
    };

    let animationFrame: number;
    const loop = () => {
      draw();
      animationFrame = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrame);
  }, [step]);

  // ---------------- WELCOME ----------------
  if (step === "welcome") {
    return (
      <div className="welcome">
        <h1
          className="glitch"
          data-text="Bienvenido"
          onClick={() => setStep("info")}
        >
          Bienvenido
        </h1>

        <style jsx>{`
          .welcome {
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background: radial-gradient(circle, #0a0a12, #000);
            color: white;
            cursor: pointer;
          }

          .glitch {
            position: relative;
            font-size: 3rem;
            text-transform: uppercase;
          }

          .glitch::before,
          .glitch::after {
            content: attr(data-text);
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background: transparent;
          }

          .glitch::after {
            left: 3px;
            text-shadow: -1px 0 #ff00ff;
            animation: glitch1 2s infinite linear alternate-reverse;
          }

          .glitch::before {
            left: -3px;
            text-shadow: 2px 0 #00f0ff;
            animation: glitch2 3s infinite linear alternate-reverse;
          }

          @keyframes glitch1 {
            0% { clip-path: inset(10% 0 80% 0); }
            50% { clip-path: inset(40% 0 40% 0); }
            100% { clip-path: inset(80% 0 5% 0); }
          }

          @keyframes glitch2 {
            0% { clip-path: inset(80% 0 5% 0); }
            50% { clip-path: inset(30% 0 50% 0); }
            100% { clip-path: inset(10% 0 80% 0); }
          }
        `}</style>
      </div>
    );
  }

  // ---------------- INFO ----------------
  if (step === "info") {
    return (
      <div className="info">
        <div className="card">
          <h2>🎮 Cómo jugar</h2>

          <p>
            El juego es una experiencia inmersiva en realidad virtual donde
            controlas un cubo verde usando tu voz.
          </p>

          <p>
            Usa: <b>izquierda</b>, <b>derecha</b>, <b>saltar</b>.
          </p>

          <p style={{ color: "#00f0ff" }}>
            💡 Se recomienda usar gafas de realidad virtual para una experiencia
            totalmente inmersiva.
          </p>

          <button onClick={() => setStep("loading")}>
            Iniciar experiencia
          </button>
        </div>

        <style jsx>{`
          .info {
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background: radial-gradient(circle, #0a0a12, #000);
            color: white;
          }

          .card {
            max-width: 600px;
            padding: 30px;
            border-radius: 20px;
            background: rgba(10, 10, 20, 0.6);
            border: 1px solid rgba(255, 0, 255, 0.3);
            box-shadow:
              0 0 20px rgba(255, 0, 255, 0.2),
              0 0 40px rgba(0, 240, 255, 0.1);
            backdrop-filter: blur(15px);
          }

          button {
            margin-top: 10px;
            padding: 10px 20px;
            border: 1px solid #00f0ff;
            background: transparent;
            color: #00f0ff;
            cursor: pointer;
            box-shadow: 0 0 10px #00f0ff;
          }

          button:hover {
            background: #00f0ff;
            color: black;
          }
        `}</style>
      </div>
    );
  }

  // ---------------- LOADING ----------------
  if (step === "loading") {
    return (
      <div className="loading">
        <canvas ref={canvasRef}></canvas>
        <p>Inicializando sistema...</p>

        <style jsx>{`
          .loading {
            height: 100vh;
            background: radial-gradient(circle, #050507, #000);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }

          p {
            color: #00f0ff;
            text-shadow: 0 0 10px #00f0ff;
            margin-top: 20px;
          }
        `}</style>
      </div>
    );
  }

  // ---------------- VR ----------------
  return <VRScene />;
}