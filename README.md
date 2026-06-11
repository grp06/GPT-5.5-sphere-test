# GPT-5.5 Sphere Test

I built this from an empty folder in response to this starter prompt:

> i only have an empty folder. i want to make the sickest 3d sphere render possible, like with shaders, and super cool animations. use any libraries, any programming languages you want.
>
> go hard. extremely hard

The result is a Vite + React + Three.js/WebGL shader toy: a full-screen animated sphere with custom GLSL displacement, emissive procedural surface detail, atmosphere, orbiting particles, ribbons, bloom, pointer-reactive motion, snapshots, fullscreen, and live controls for energy, refraction, orbit, bloom, and shader mode.

My approach was to keep the React layer thin and put the visual system in one owning engine module. React owns the HUD and state; `SphereEngine` owns the renderer, scene lifecycle, shaders, postprocessing, resize behavior, pointer input, capture, and cleanup. That kept the app small enough to understand while leaving room for the render to be loud.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
