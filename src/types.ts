export type ShaderMode = "plasma" | "iris" | "wire" | "eclipse";

export type SphereControls = {
  energy: number;
  refraction: number;
  orbit: number;
  bloom: number;
  mode: ShaderMode;
  seed: number;
  motion: boolean;
};

export type RenderMetrics = {
  fps: number;
  gpu: number;
  temp: number;
  memory: number;
};
