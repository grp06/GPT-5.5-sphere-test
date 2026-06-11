import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { RenderMetrics, ShaderMode, SphereControls } from "./types";

const modeIndex: Record<ShaderMode, number> = {
  plasma: 0,
  iris: 1,
  wire: 2,
  eclipse: 3,
};

const sphereVertexShader = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uMode;
  uniform float uSeed;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vDisplacement;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat3 twist = mat3(
      0.00, 0.80, 0.60,
      -0.80, 0.36, -0.48,
      -0.60, -0.48, 0.64
    );

    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = twist * p * 2.04 + 0.17;
      amplitude *= 0.52;
    }

    return value;
  }

  void main() {
    vUv = uv;
    vec3 n = normalize(normal);
    float time = uTime * (0.18 + uEnergy * 0.24);
    vec3 seed = vec3(uSeed * 9.7, uSeed * 4.3, uSeed * 12.1);
    vec3 flowP = n * (2.6 + uMode * 0.45) + seed + vec3(time, -time * 0.72, time * 0.37);
    float flow = fbm(flowP);
    float river = fbm(n * 8.0 + seed.yzx + vec3(-time * 1.4, time * 0.55, time));
    float pulse = sin(uTime * 1.7 + flow * 9.0 + uSeed * 14.0) * 0.5 + 0.5;
    float displacement = (flow * 0.09 + pow(river, 3.0) * 0.075 + pulse * 0.018) * uEnergy;
    vec3 displaced = position + n * displacement;
    vec4 world = modelMatrix * vec4(displaced, 1.0);

    vPosition = displaced;
    vNormal = normalize(normalMatrix * n);
    vWorldPosition = world.xyz;
    vDisplacement = displacement;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const sphereFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uEnergy;
  uniform float uRefraction;
  uniform float uMode;
  uniform float uSeed;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vDisplacement;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat3 twist = mat3(
      0.00, 0.80, 0.60,
      -0.80, 0.36, -0.48,
      -0.60, -0.48, 0.64
    );

    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = twist * p * 2.05 + 0.13;
      amplitude *= 0.52;
    }

    return value;
  }

  float line(float value, float width) {
    float centered = abs(fract(value) - 0.5);
    return 1.0 - smoothstep(width, width + 0.028, centered);
  }

  vec3 palette(float t, float mode) {
    vec3 cyan = vec3(0.02, 0.88, 1.0);
    vec3 emerald = vec3(0.0, 0.95, 0.62);
    vec3 coral = vec3(1.0, 0.26, 0.34);
    vec3 gold = vec3(1.0, 0.72, 0.25);
    vec3 violet = vec3(0.48, 0.32, 1.0);
    vec3 ice = vec3(0.62, 0.92, 1.0);

    if (mode < 0.5) {
      return mix(mix(cyan, coral, smoothstep(0.22, 0.72, t)), gold, smoothstep(0.72, 1.0, t));
    }

    if (mode < 1.5) {
      return mix(mix(emerald, violet, smoothstep(0.16, 0.68, t)), ice, smoothstep(0.68, 1.0, t));
    }

    if (mode < 2.5) {
      return mix(mix(ice, cyan, smoothstep(0.12, 0.7, t)), gold, smoothstep(0.7, 1.0, t));
    }

    return mix(mix(vec3(0.06, 0.09, 0.16), coral, smoothstep(0.35, 0.75, t)), gold, smoothstep(0.75, 1.0, t));
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.35);
    float time = uTime * (0.1 + uEnergy * 0.28);
    vec3 seed = vec3(uSeed * 11.1, uSeed * 6.7, uSeed * 15.3);
    vec3 p = normalize(vPosition);
    vec3 warp = vec3(
      fbm(p * 3.0 + seed + time),
      fbm(p * 3.6 + seed.yzx - time * 0.7),
      fbm(p * 4.2 + seed.zxy + time * 0.38)
    );
    float plasma = fbm(p * (4.1 + uRefraction * 3.6) + warp * 2.8 + seed);
    float fissureSource = fbm(p * 7.8 + warp * 2.4 + vec3(-time * 1.6, time, time * 0.4));
    float fissures = smoothstep(0.54, 0.82, fissureSource) * smoothstep(0.18, 0.86, plasma);
    float contours = line((p.y + warp.x * 0.34) * 11.5 + time * 0.45, 0.018);
    contours += line((p.x * 0.82 + p.z * 0.36 + warp.y * 0.4) * 9.5 - time * 0.32, 0.014);
    contours *= smoothstep(0.25, 0.92, fbm(p * 5.4 + seed.zxy));
    float riverMask = smoothstep(0.36, 0.88, fbm(p * 2.15 + warp + seed.yzx));
    float riverA = line((p.x * 0.78 + p.y * 0.46 + warp.x * 0.86) * 3.2 + time * 0.18, 0.035);
    float riverB = line((p.y * 0.58 - p.z * 0.52 + warp.y * 0.72) * 2.7 - time * 0.14, 0.028);
    float rivers = max(riverA, riverB * 0.82) * riverMask;

    float triA = line((p.x + p.y * 0.52 + p.z * 0.19) * 13.0, 0.01);
    float triB = line((p.y - p.z * 0.64 + p.x * 0.23) * 13.0, 0.01);
    float triC = line((p.z + p.x * 0.61 - p.y * 0.18) * 13.0, 0.01);
    float lattice = max(max(triA * 0.55, triB * 0.52), triC * 0.46);
    lattice *= smoothstep(0.38, 0.82, fbm(p * 2.7 + seed));

    float iris = smoothstep(0.1, 0.95, plasma + fresnel * 0.25);
    vec3 lineColor = palette(fract(plasma + vUv.y * 0.25 + uTime * 0.035), uMode);
    vec3 deep = mix(vec3(0.001, 0.008, 0.02), vec3(0.004, 0.026, 0.042), uRefraction);
    float shade = smoothstep(-0.35, 0.92, dot(normal, normalize(vec3(-0.45, 0.24, 0.86))));
    vec3 glass = palette(iris, uMode) * (0.012 + plasma * 0.034);
    vec3 color = deep + glass;

    color *= 0.22 + shade * 0.7;
    color += lineColor * fissures * (1.45 + uEnergy * 1.9);
    color += mix(vec3(0.0, 0.92, 1.0), vec3(1.0, 0.28, 0.34), smoothstep(0.28, 0.86, riverMask)) * rivers * (1.15 + uEnergy * 1.75);
    color += mix(vec3(0.0, 0.8, 1.0), lineColor, 0.5) * contours * (0.42 + uRefraction * 0.74);
    color += vec3(0.95, 0.72, 0.42) * lattice * (uMode > 1.5 ? 0.6 : 0.42);
    color += palette(0.94, uMode) * fresnel * (0.28 + uRefraction * 0.46);
    color += vec3(0.65, 0.96, 1.0) * pow(fresnel, 4.0) * 0.42;
    color += vec3(0.02, 0.9, 1.0) * vDisplacement * 1.2;

    if (uMode > 2.5) {
      float eclipseShade = smoothstep(-0.2, 0.72, dot(normal, normalize(vec3(-0.45, 0.18, 0.88))));
      color *= mix(0.22, 1.0, eclipseShade);
      color += vec3(1.0, 0.55, 0.22) * pow(1.0 - eclipseShade, 6.0) * 1.05;
    }

    color = color / (vec3(1.0) + color);
    color = pow(color * 0.76, vec3(0.96));
    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosphereFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uEnergy;
  uniform float uMode;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  vec3 modeGlow(float mode) {
    if (mode < 0.5) return vec3(0.02, 0.86, 1.0);
    if (mode < 1.5) return vec3(0.0, 0.94, 0.62);
    if (mode < 2.5) return vec3(0.68, 0.94, 1.0);
    return vec3(1.0, 0.48, 0.22);
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.65);
    float pulse = sin(uTime * 1.8 + vWorldPosition.y * 5.0) * 0.5 + 0.5;
    vec3 color = modeGlow(uMode) * (1.2 + pulse * 0.28);
    float alpha = rim * (0.22 + uEnergy * 0.16);
    gl_FragColor = vec4(color, alpha);
  }
`;

const particleVertexShader = `
  uniform float uTime;
  uniform float uOrbit;
  uniform float uEnergy;

  attribute float aPhase;
  attribute float aSize;
  attribute float aHue;

  varying float vHue;
  varying float vAlpha;
  varying float vBand;

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec3 p = position;
    float drift = uTime * (0.12 + aPhase * 0.018) * (0.3 + uOrbit * 1.2);
    p.xz = rotate2d(drift) * p.xz;
    p.xy = rotate2d(drift * 0.37 + aPhase) * p.xy;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vHue = aHue;
    vAlpha = 0.54 + sin(uTime * 1.7 + aPhase * 6.283185) * 0.22;
    vBand = smoothstep(1.18, 1.88, length(p.xy));
    gl_PointSize = aSize * (36.0 / max(0.2, -mv.z)) * (0.62 + uEnergy * 0.52);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragmentShader = `
  precision highp float;

  varying float vHue;
  varying float vAlpha;
  varying float vBand;

  vec3 spectral(float t) {
    vec3 cyan = vec3(0.04, 0.9, 1.0);
    vec3 emerald = vec3(0.0, 0.95, 0.58);
    vec3 coral = vec3(1.0, 0.24, 0.34);
    vec3 gold = vec3(1.0, 0.74, 0.27);
    return mix(mix(cyan, emerald, smoothstep(0.0, 0.42, t)), mix(coral, gold, smoothstep(0.58, 1.0, t)), smoothstep(0.36, 0.92, t));
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float core = smoothstep(0.5, 0.02, dist);
    float glow = smoothstep(0.5, 0.0, dist) * 0.45;
    gl_FragColor = vec4(spectral(vHue) * (core + glow * 0.92), (core + glow * 0.8) * vAlpha * vBand * 0.5);
  }
`;

const ribbonVertexShader = `
  uniform float uTime;

  attribute float aIndex;
  attribute float aWave;

  varying float vAlpha;

  void main() {
    vec3 p = position;
    p.y += sin(aIndex * 0.12 + uTime * (0.28 + aWave * 0.15)) * 0.08 * aWave;
    p.z += cos(aIndex * 0.09 + uTime * 0.2) * 0.06 * aWave;
    vAlpha = 0.18 + sin(aIndex * 0.05 + uTime * 0.5) * 0.08;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const ribbonFragmentShader = `
  precision highp float;

  uniform vec3 uColor;

  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function buildRing(radius: number, segments: number, color: THREE.ColorRepresentation) {
  const points: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));

  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function createRibbon(
  side: "left" | "right",
  color: THREE.ColorRepresentation,
  yBase: number,
  zBase: number,
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const waves: number[] = [];
  const width = 7.5;
  const start = side === "left" ? -5.2 : 5.2;
  const direction = side === "left" ? 1 : -1;

  for (let i = 0; i < 180; i += 1) {
    const t = i / 179;
    const x = start + direction * t * width;
    const y =
      yBase +
      Math.sin(t * Math.PI * 3.2) * 0.22 +
      Math.sin(t * Math.PI * 9.3) * 0.055;
    const z = zBase + Math.cos(t * Math.PI * 2.0) * 0.18;
    vertices.push(x, y, z);
    indices.push(i);
    waves.push(0.65 + Math.random() * 0.65);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("aIndex", new THREE.Float32BufferAttribute(indices, 1));
  geometry.setAttribute("aWave", new THREE.Float32BufferAttribute(waves, 1));

  return new THREE.Line(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: ribbonVertexShader,
      fragmentShader: ribbonFragmentShader,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}

export class SphereEngine {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(41, 1, 0.1, 120);
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly sphereGroup = new THREE.Group();
  private readonly haloGroup = new THREE.Group();
  private readonly starGroup = new THREE.Group();
  private readonly ribbonMaterials: THREE.ShaderMaterial[] = [];
  private readonly sphereUniforms: Record<string, { value: number }>;
  private readonly atmosphereUniforms: Record<string, { value: number }>;
  private readonly particleUniforms: Record<string, { value: number }>;
  private readonly clock = new THREE.Clock();
  private readonly pointer = new THREE.Vector2(0, 0);
  private readonly pointerTarget = new THREE.Vector2(0, 0);
  private readonly target: SphereControls;
  private readonly current: SphereControls;
  private readonly metricsCallback: (metrics: RenderMetrics) => void;
  private readonly prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private animationFrame = 0;
  private elapsed = 0;
  private frameCounter = 0;
  private fpsWindow = performance.now();
  private lastFps = 60;

  constructor(
    container: HTMLElement,
    controls: SphereControls,
    metricsCallback: (metrics: RenderMetrics) => void,
  ) {
    this.container = container;
    this.target = { ...controls };
    this.current = { ...controls };
    this.metricsCallback = metricsCallback;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x02050a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.container.appendChild(this.renderer.domElement);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.26, 0.18);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.sphereUniforms = {
      uTime: { value: 0 },
      uEnergy: { value: controls.energy },
      uRefraction: { value: controls.refraction },
      uMode: { value: modeIndex[controls.mode] },
      uSeed: { value: controls.seed },
    };
    this.atmosphereUniforms = {
      uTime: { value: 0 },
      uEnergy: { value: controls.energy },
      uMode: { value: modeIndex[controls.mode] },
    };
    this.particleUniforms = {
      uTime: { value: 0 },
      uOrbit: { value: controls.orbit },
      uEnergy: { value: controls.energy },
    };

    this.scene.fog = new THREE.FogExp2(0x02050a, 0.042);
    this.camera.position.set(0, 0, 5.3);

    this.buildBackdrop();
    this.buildSphere();
    this.buildHalo();
    this.buildRibbons();

    this.scene.add(this.starGroup);
    this.scene.add(this.haloGroup);
    this.scene.add(this.sphereGroup);

    window.addEventListener("resize", this.resize);
    this.container.addEventListener("pointermove", this.onPointerMove);
    this.container.addEventListener("pointerleave", this.onPointerLeave);
    this.resize();
    this.animate();
  }

  setControls(controls: SphereControls) {
    Object.assign(this.target, controls);
  }

  capture() {
    this.composer.render();
    return this.renderer.domElement.toDataURL("image/png", 1);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerleave", this.onPointerLeave);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const material = object.material;

        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material.dispose();
        }
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly resize = () => {
    const { clientWidth, clientHeight } = this.container;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.camera.aspect = clientWidth / Math.max(1, clientHeight);
    this.camera.position.z = clientWidth < 720 ? 6.25 : 5.28;
    this.camera.fov = clientWidth < 720 ? 45 : 41;
    this.camera.updateProjectionMatrix();

    this.sphereGroup.scale.setScalar(clientWidth < 720 ? 0.86 : 1);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(clientWidth, clientHeight);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.pointerTarget.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    this.pointerTarget.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  private readonly onPointerLeave = () => {
    this.pointerTarget.set(0, 0);
  };

  private buildBackdrop() {
    const starCount = 3200;
    const positions = new Float32Array(starCount * 3);
    const phases = new Float32Array(starCount);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);
    const palette = [
      new THREE.Color("#7eefff"),
      new THREE.Color("#00ffc2"),
      new THREE.Color("#ff596f"),
      new THREE.Color("#ffd479"),
      new THREE.Color("#766dff"),
    ];

    for (let i = 0; i < starCount; i += 1) {
      const radius = 8 + Math.random() * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius * 0.62;
      positions[i * 3 + 2] = -Math.abs(Math.sin(phi) * Math.sin(theta) * radius) - 2;
      phases[i] = Math.random();
      sizes[i] = 0.45 + Math.random() * (Math.random() > 0.965 ? 8 : 2.4);

      const color = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.026,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.starGroup.add(new THREE.Points(geometry, material));
  }

  private buildSphere() {
    const geometry = new THREE.SphereGeometry(1.5, 192, 112);
    const material = new THREE.ShaderMaterial({
      uniforms: this.sphereUniforms,
      vertexShader: sphereVertexShader,
      fragmentShader: sphereFragmentShader,
    });
    const sphere = new THREE.Mesh(geometry, material);
    this.sphereGroup.add(sphere);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.575, 128, 80),
      new THREE.ShaderMaterial({
        uniforms: this.atmosphereUniforms,
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    this.sphereGroup.add(atmosphere);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.515, 6)),
      new THREE.LineBasicMaterial({
        color: 0xffc771,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    wire.name = "micro-lattice";
    this.sphereGroup.add(wire);

    const particleCount = 900;
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);
    const hues = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i += 1) {
      const radius = 1.62 + Math.random() * 0.42 + Math.pow(Math.random(), 8) * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      phases[i] = Math.random();
      sizes[i] = 1.4 + Math.random() * (Math.random() > 0.94 ? 5.4 : 2.4);
      hues[i] = Math.random();
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    particleGeometry.setAttribute("aHue", new THREE.BufferAttribute(hues, 1));

    this.sphereGroup.add(
      new THREE.Points(
        particleGeometry,
        new THREE.ShaderMaterial({
          uniforms: this.particleUniforms,
          vertexShader: particleVertexShader,
          fragmentShader: particleFragmentShader,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
  }

  private buildHalo() {
    const rings = [
      buildRing(2.02, 360, "#16e7ff"),
      buildRing(2.24, 360, "#ffb25d"),
      buildRing(2.48, 360, "#675dff"),
      buildRing(2.68, 360, "#12ffc4"),
    ];

    rings.forEach((ring, index) => {
      ring.rotation.set(
        0.42 + index * 0.18,
        0.1 + index * 0.36,
        index * 0.64,
      );
      ring.position.z = -0.22 - index * 0.03;
      this.haloGroup.add(ring);
    });

    const haloDisk = new THREE.Mesh(
      new THREE.RingGeometry(1.92, 2.72, 192),
      new THREE.MeshBasicMaterial({
        color: 0x0de9ff,
        transparent: true,
        opacity: 0.035,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    haloDisk.rotation.x = 0.28;
    haloDisk.position.z = -0.32;
    this.haloGroup.add(haloDisk);
  }

  private buildRibbons() {
    const ribbons = [
      createRibbon("left", "#00ffc4", -0.85, -2.8),
      createRibbon("left", "#12dfff", 0.95, -3.4),
      createRibbon("right", "#8b6dff", 0.8, -3.2),
      createRibbon("right", "#ff5d72", -0.55, -2.9),
    ];

    ribbons.forEach((ribbon) => {
      const material = ribbon.material;

      if (material instanceof THREE.ShaderMaterial) {
        this.ribbonMaterials.push(material);
      }

      this.scene.add(ribbon);
    });
  }

  private animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const dt = Math.min(0.033, this.clock.getDelta());

    if (this.target.motion && !this.prefersReducedMotion) {
      this.elapsed += dt;
    }

    this.current.energy = damp(this.current.energy, this.target.energy, 5, dt);
    this.current.refraction = damp(this.current.refraction, this.target.refraction, 5, dt);
    this.current.orbit = damp(this.current.orbit, this.target.orbit, 4, dt);
    this.current.bloom = damp(this.current.bloom, this.target.bloom, 4, dt);
    this.current.seed = damp(this.current.seed, this.target.seed, 2.5, dt);
    this.current.mode = this.target.mode;
    this.current.motion = this.target.motion;
    this.pointer.x = damp(this.pointer.x, this.pointerTarget.x, 4.2, dt);
    this.pointer.y = damp(this.pointer.y, this.pointerTarget.y, 4.2, dt);

    const mode = modeIndex[this.current.mode];
    this.sphereUniforms.uTime.value = this.elapsed;
    this.sphereUniforms.uEnergy.value = this.current.energy;
    this.sphereUniforms.uRefraction.value = this.current.refraction;
    this.sphereUniforms.uMode.value = mode;
    this.sphereUniforms.uSeed.value = this.current.seed;

    this.atmosphereUniforms.uTime.value = this.elapsed;
    this.atmosphereUniforms.uEnergy.value = this.current.energy;
    this.atmosphereUniforms.uMode.value = mode;

    this.particleUniforms.uTime.value = this.elapsed;
    this.particleUniforms.uOrbit.value = this.current.orbit;
    this.particleUniforms.uEnergy.value = this.current.energy;

    this.ribbonMaterials.forEach((material) => {
      material.uniforms.uTime.value = this.elapsed;
    });

    this.sphereGroup.rotation.y += dt * (0.075 + this.current.orbit * 0.22) * (this.target.motion ? 1 : 0);
    this.sphereGroup.rotation.x = this.pointer.y * 0.13 - 0.04;
    this.sphereGroup.rotation.z = this.pointer.x * -0.04;
    this.haloGroup.rotation.z -= dt * (0.03 + this.current.orbit * 0.08) * (this.target.motion ? 1 : 0);
    this.haloGroup.rotation.x = this.pointer.y * 0.07 + 0.18;
    this.starGroup.rotation.y += dt * 0.006 * (this.target.motion ? 1 : 0);
    this.starGroup.position.x = this.pointer.x * -0.05;
    this.starGroup.position.y = this.pointer.y * -0.035;

    this.bloomPass.strength = 0.1 + this.current.bloom * 0.5;
    this.bloomPass.radius = 0.18 + this.current.refraction * 0.2;
    this.renderer.toneMappingExposure = 0.58 + this.current.energy * 0.09;

    this.composer.render();
    this.updateMetrics();
  };

  private updateMetrics() {
    this.frameCounter += 1;
    const now = performance.now();

    if (now - this.fpsWindow < 500) {
      return;
    }

    this.lastFps = (this.frameCounter * 1000) / (now - this.fpsWindow);
    this.frameCounter = 0;
    this.fpsWindow = now;

    this.metricsCallback({
      fps: this.lastFps,
      gpu: 48 + this.current.energy * 32 + this.current.bloom * 13,
      temp: 44 + this.current.energy * 17 + this.current.bloom * 6,
      memory: 1.7 + this.current.refraction * 0.5 + this.current.orbit * 0.22,
    });
  }
}
