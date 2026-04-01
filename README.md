# 🎤 VR Voice Runner

Un juego de carreras infinitas en 3D, desarrollado con Next.js y A‑Frame, donde controlas una esfera azul mediante comandos de voz. Esquiva obstáculos, recolecta estrellas y sobrevive el mayor tiempo posible.

## ✨ Características

- 🗣️ **Control por voz** – Muévete a la izquierda, derecha o salta usando comandos de voz simples.
- 🎮 **Escena VR inmersiva** – Construida con A‑Frame, funciona en cualquier navegador (móvil o escritorio).
- 💖 **Sistema de vidas** – 5 corazones; pierde uno al chocar con un obstáculo, gana uno al recoger una estrella.
- ⭐ **Estrellas coleccionables** – Aumentan tus vidas y añaden un efecto visual.
- 🚀 **Dificultad progresiva** – La velocidad del juego aumenta con el tiempo.
- 🎯 **Retroalimentación visual** – La esfera escala brevemente al recibir un golpe; las estrellas rotan.

## 🛠️ Tecnologías utilizadas

- [Next.js](https://nextjs.org/) – Framework React
- [A-Frame](https://aframe.io/) – Framework WebVR
- TypeScript
- Web Speech API – para reconocimiento de voz (idioma español‑MX)

## 🚀 Cómo empezar

### Requisitos previos

- Node.js (v16 o superior)
- Un navegador moderno con soporte para Web Speech API (Chrome, Edge, Safari)
- Un micrófono

### Instalación

1. Clona el repositorio:

   ```bash
   git clone https://github.com/tu-usuario/vr-voice-runner.git
   cd vr-voice-runner
   ```
2. Instala las dependencias:

   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```
4. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### Construir para producción

```bash
npm run build
npm start
```

## 🎮 Cómo jugar

1. **Permite el acceso al micrófono** – Haz clic en el botón verde **Activar micrófono** y concede el permiso cuando el navegador lo solicite.
2. **El juego comienza** – Una vez activado, la esfera avanzará automáticamente.
3. **Comandos de voz** – Habla con claridad en español:

   - *"izquierda"* – mueve la esfera un carril a la izquierda
   - *"derecha"* – mueve la esfera un carril a la derecha
   - *"saltar"* – salta para esquivar obstáculos
   - Puedes combinar comandos en una frase, por ejemplo: *"salta a la derecha"* ejecutará salto y movimiento a la derecha.
4. **Evita los obstáculos** – Los cubos, esferas y cilindros rojos restan una vida si los tocas.
5. **Recoge estrellas** – Los octaedros dorados te otorgan una vida extra (máximo 5 corazones).
6. **Sobrevive** – El juego termina cuando pierdes todas las vidas. Presiona **Reiniciar** para empezar de nuevo.

## 🧠 Mecánicas del juego

- **Carriles** – Tres carriles: izquierdo, central, derecho.
- **Puntuación** – Aumenta con el tiempo sobrevivido (10 puntos por segundo).
- **Dificultad** – La velocidad aumenta gradualmente, haciendo que los obstáculos aparezcan con más frecuencia.
- **Salto** – Dura 0.4 segundos y eleva la esfera para esquivar obstáculos en el suelo.

## 🛑 Solución de problemas


| Problema                            | Solución                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| El micrófono no funciona           | Asegúrate de haber concedido el permiso. En Chrome, haz clic en el candado en la barra de direcciones y permite el micrófono. |
| Los comandos de voz no se reconocen | Habla con claridad. El reconocimiento está configurado para español de México. Un entorno silencioso ayuda.                  |
| El juego no comienza                | Solo inicia después de hacer clic en**Activar micrófono** y aceptar el permiso.                                               |
| La escena de A‑Frame no carga      | Revisa la consola del navegador. Si estás detrás de un cortafuegos, asegúrate de que el CDN de A‑Frame sea accesible.       |
| "Game Over" demasiado rápido       | Intenta anticipar los obstáculos y usa el salto temprano.                                                                      |

## 🧪 Compatibilidad de navegadores

- **Funciona mejor en** – Chrome, Edge, Safari (escritorio y móvil)
- **Soporte parcial** – Firefox (la API Web Speech puede requerir habilitarse en configuración)
- **No compatible** – Internet Explorer, navegadores antiguos

## 📁 Estructura del proyecto

```
.
├── src/
│   ├── components/
│   │   └── VRScene.tsx   # Componente principal del juego
│   └── pages/
│       └── index.tsx      # Página de entrada de Next.js
├── public/                 # Archivos estáticos
├── package.json
└── README.md
```

## 🙌 Contribuciones

¡Las contribuciones son bienvenidas! Por favor, abre un issue o pull request para sugerir mejoras, reportar errores o añadir nuevas características.
