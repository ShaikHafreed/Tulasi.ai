---
name: threejs-viewer
description: Rules for the Three.js / react-three-fiber viewer in frontend/src/components/ModelViewer.tsx — scale normalization, resource disposal, render-loop settings. Use when touching the 3D viewer or adding anything that loads a new GLB.
---

# Three.js viewer rules

## Scale normalization

Incoming GLBs have arbitrary real-world scale (a mug vs. a chair). On load:
1. Compute the model's bounding box (`THREE.Box3().setFromObject(scene)`).
2. Find its max dimension.
3. Scale the model so that max dimension equals 2 world units.
4. Keep the computed scale factor around — Phase 2's DimensionPanel needs it
   to convert world units back to real-world mm.

## Resource disposal

`useGLTF`-loaded scenes hold GPU resources (geometries, materials, textures).
Dispose them on unmount / when swapping to a new model — don't let old
models leak. Don't rely on garbage collection for GPU memory.

## Render loop

- `frameloop="demand"` on the `<Canvas>` — this viewer doesn't need a
  constant 60fps loop when nothing is animating or being dragged; render on
  invalidation only.
- `dpr={[1, 2]}` — cap device pixel ratio at 2 so high-DPI displays don't
  tank performance for no visible benefit.

## Studio lighting

Use drei's `<Stage>` (or equivalent environment + shadow setup) rather than
hand-rolled lights, so every model gets consistent, presentable lighting
without per-model tuning.
