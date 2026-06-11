import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Activity,
  Box,
  Camera,
  Maximize,
  Pause,
  Play,
  Shuffle,
} from "lucide-react";
import { SphereEngine } from "./SphereEngine";
import type { RenderMetrics, ShaderMode, SphereControls } from "./types";

const modes: Array<{ id: ShaderMode; label: string }> = [
  { id: "plasma", label: "Plasma" },
  { id: "iris", label: "Iris" },
  { id: "wire", label: "Wire" },
  { id: "eclipse", label: "Eclipse" },
];

const sliders: Array<{
  key: "energy" | "refraction" | "orbit" | "bloom";
  label: string;
}> = [
  { key: "energy", label: "Energy" },
  { key: "refraction", label: "Refraction" },
  { key: "orbit", label: "Orbit" },
  { key: "bloom", label: "Bloom" },
];

const defaultControls: SphereControls = {
  energy: 0.78,
  refraction: 0.55,
  orbit: 0.64,
  bloom: 0.82,
  mode: "plasma",
  seed: 0.37,
  motion: true,
};

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function randomControls(current: SphereControls): SphereControls {
  const mode = modes[Math.floor(Math.random() * modes.length)].id;

  return {
    ...current,
    energy: 0.58 + Math.random() * 0.42,
    refraction: 0.34 + Math.random() * 0.54,
    orbit: 0.28 + Math.random() * 0.68,
    bloom: 0.5 + Math.random() * 0.48,
    mode,
    seed: Math.random(),
  };
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SphereEngine | null>(null);
  const [controls, setControls] = useState<SphereControls>(defaultControls);
  const [metrics, setMetrics] = useState<RenderMetrics>({
    fps: 60,
    gpu: 68,
    temp: 58,
    memory: 2.1,
  });

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const engine = new SphereEngine(stage, controls, setMetrics);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setControls(controls);
  }, [controls]);

  const status = useMemo(
    () => ({
      fps: Math.round(metrics.fps),
      gpu: Math.round(metrics.gpu),
      temp: Math.round(metrics.temp),
      memory: metrics.memory.toFixed(1),
    }),
    [metrics],
  );

  const updateSlider =
    (key: "energy" | "refraction" | "orbit" | "bloom") =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = clampUnit(Number(event.target.value));
      setControls((next) => ({ ...next, [key]: value }));
    };

  function snapshot() {
    const dataUrl = engineRef.current?.capture();

    if (!dataUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `sphere-lab-${Date.now()}.png`;
    anchor.click();
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      return;
    }

    await document.exitFullscreen?.();
  }

  return (
    <main className="app-shell" aria-label="Sphere Lab shader visualizer">
      <div className="render-stage" ref={stageRef} />

      <header className="lab-brand" aria-label="Sphere Lab">
        <span>SPHERE</span>
        <span className="slash">/</span>
        <span>LAB</span>
      </header>

      <nav className="icon-dock" aria-label="Render actions">
        <button
          type="button"
          className="icon-button"
          onClick={() => setControls((next) => randomControls(next))}
          aria-label="Randomize shader"
          title="Randomize shader"
        >
          <Shuffle size={21} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={snapshot}
          aria-label="Save snapshot"
          title="Save snapshot"
        >
          <Camera size={21} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() =>
            setControls((next) => ({ ...next, motion: !next.motion }))
          }
          aria-label={controls.motion ? "Pause motion" : "Resume motion"}
          title={controls.motion ? "Pause motion" : "Resume motion"}
        >
          {controls.motion ? (
            <Activity size={21} strokeWidth={1.8} />
          ) : (
            <Pause size={21} strokeWidth={1.8} />
          )}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={toggleFullscreen}
          aria-label="Enter fullscreen"
          title="Enter fullscreen"
        >
          <Maximize size={21} strokeWidth={1.8} />
        </button>
      </nav>

      <section className="lab-sliders" aria-label="Shader parameters">
        {sliders.map((slider) => (
          <label className="control-row" key={slider.key}>
            <span>{slider.label}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={controls[slider.key]}
              onChange={updateSlider(slider.key)}
              aria-label={slider.label}
            />
            <output>{controls[slider.key].toFixed(2)}</output>
          </label>
        ))}
      </section>

      <section className="mode-dock" aria-label="Shader mode">
        {modes.map((mode) => (
          <button
            type="button"
            className={mode.id === controls.mode ? "selected" : ""}
            onClick={() => setControls((next) => ({ ...next, mode: mode.id }))}
            key={mode.id}
          >
            {mode.label}
          </button>
        ))}
      </section>

      <aside className="status-readout" aria-label="Render status">
        <span>FPS <strong>{status.fps}</strong></span>
        <i />
        <span>GPU <strong>{status.gpu}%</strong></span>
        <i />
        <span>TEMP <strong className="warm">{status.temp}C</strong></span>
        <i />
        <span>MEM <strong>{status.memory} GB</strong></span>
      </aside>

      <div className="system-mark" aria-hidden="true">
        <Box size={16} strokeWidth={1.6} />
        <span>{controls.motion ? "LIVE FIELD" : "FIELD HOLD"}</span>
        {controls.motion ? <Play size={12} /> : <Pause size={12} />}
      </div>
    </main>
  );
}
