"use client";

import { useEffect } from "react";
import { folder, LevaPanel, useControls, useCreateStore } from "leva";

import { defaultParams, type StageEngine, type StageParams } from "./engine";

/**
 * ─── StageTuner ───
 *
 * Live controls for the camera, the fog, the air and the film. Loaded only
 * with `?tune` in the URL, as its own chunk, so it costs a normal visit
 * nothing. When a value is right, copy it into the constant it came from
 * (the folder names say which file).
 *
 * A PRIVATE store, never Leva's global one: the global panel mounts itself
 * with ReactDOM.render, which React 19 removed. A store from useCreateStore
 * rendered through LevaPanel never takes that path.
 */
export default function StageTuner({ engine }: { engine: StageEngine }) {
  const store = useCreateStore();
  const d = defaultParams();

  const values = useControls(
    {
      "Camera · stage/motion": folder({
        swayX: { value: d.swayX, min: 0, max: 0.2, step: 0.005, label: "lean x m" },
        swayY: { value: d.swayY, min: 0, max: 0.1, step: 0.005, label: "lean y m" },
        swayRate: { value: d.swayRate, min: 1, max: 12, step: 0.1, label: "spring ω" },
      }),
      "Fog · atmosphere/optics": folder({
        nearExtinction: { value: d.nearExtinction, min: 0, max: 0.03, step: 0.0005, label: "β near" },
        farExtinction: { value: d.farExtinction, min: 0, max: 0.1, step: 0.001, label: "β bank" },
        bankFrom: { value: d.bankFrom, min: 0, max: 60, step: 0.5, label: "bank from m" },
        bankTo: { value: d.bankTo, min: 1, max: 120, step: 0.5, label: "bank full m" },
        lift: { value: d.lift, min: 0, max: 6, step: 0.1, label: "lift ×" },
        veil: { value: d.veil, min: 0, max: 0.4, step: 0.005, label: "wisp veil τ" },
        wisps: { value: d.wisps, min: 1, max: 6, step: 0.1, label: "wisp sharpness" },
        mistSeen: { value: d.mistSeen, min: 0, max: 0.4, step: 0.005, label: "mist seen moving" },
        fogLife: { value: d.fogLife, min: 0, max: 6, step: 0.1, label: "fog over photo" },
        aerial: { value: d.aerial, min: 0, max: 0.006, step: 0.0002, label: "aerial depth" },
        detail: { value: d.detail, min: 0, max: 2, step: 0.05 },
        form: { value: d.form, min: 0, max: 3, step: 0.05 },
        selfShadow: { value: d.selfShadow, min: 0, max: 2, step: 0.05 },
        lightExtinction: { value: d.lightExtinction, min: 0, max: 4, step: 0.05, label: "light k" },
        ambient: { value: d.ambient, min: 0, max: 1, step: 0.01 },
      }),
      "Air · atmosphere/motion": folder({
        vorticity: { value: d.vorticity, min: 0, max: 40, step: 0.5 },
        velocityHalfLife: { value: d.velocityHalfLife, min: 0.1, max: 4, step: 0.05, label: "motion ½ s" },
        healSeconds: { value: d.healSeconds, min: 0.3, max: 12, step: 0.1, label: "heal τ s" },
        currents: { value: d.currents, min: 0, max: 30, step: 0.5 },
        breath: { value: d.breath, min: 0, max: 3, step: 0.05 },
        spell: { value: d.spell, min: 0, max: 3, step: 0.05 },
        wake: { value: d.wake, min: 0, max: 3, step: 0.05 },
      }),
      "Water · water/motion": folder({
        swell: { value: d.swell, min: 0, max: 4, step: 0.05, label: "swell ×" },
        undulation: { value: d.undulation, min: 0, max: 3, step: 0.05, label: "undulation ×" },
        ripples: { value: d.ripples, min: 0, max: 4, step: 0.05, label: "ripples ×" },
        waver: { value: d.waver, min: 1, max: 14, step: 0.5, label: "stone mirror waver" },
        lapping: { value: d.lapping, min: 0, max: 4, step: 0.05, label: "lapping at stone ×" },
        paws: { value: d.paws, min: 0, max: 1, step: 0.01, label: "paw cover" },
        glass: { value: d.glass, min: 0, max: 1, step: 0.01, label: "glass" },
      }),
      "Film · stage/optics": folder({
        exposure: { value: d.exposure, min: -2, max: 2, step: 0.01, label: "exposure st" },
        footFrom: { value: d.footFrom, min: 0, max: 1, step: 0.01, label: "foot from" },
        footStops: { value: d.footStops, min: 0, max: 3, step: 0.02, label: "foot st" },
        lakeBurnHorizon: { value: d.lakeBurnHorizon, min: 0, max: 4, step: 0.05, label: "lake burn top st" },
        lakeBurnFoot: { value: d.lakeBurnFoot, min: 0, max: 5, step: 0.05, label: "lake burn foot st" },
        lakeBurnShape: { value: d.lakeBurnShape, min: 0.2, max: 2, step: 0.05, label: "lake burn ramp" },
        lakeContrast: { value: d.lakeContrast, min: 0, max: 1, step: 0.01, label: "lake contrast" },
        vignette: { value: d.vignette, min: 0, max: 0.6, step: 0.01, label: "burn to rim" },
        paperWhite: { value: d.paperWhite, min: 0.6, max: 1, step: 0.005, label: "paper white" },
        paperGamma: { value: d.paperGamma, min: 0.8, max: 1.8, step: 0.01, label: "paper gamma" },
        diffusion: { value: d.diffusion, min: 0, max: 0.3, step: 0.005 },
        halation: { value: d.halation, min: 0, max: 0.6, step: 0.01, label: "halation (photo)" },
        softBlack: { value: d.softBlack, min: 0, max: 0.2, step: 0.005, label: "soft blacks" },
        spread: { value: d.spread, min: 0, max: 0.95, step: 0.01, label: "glow reach" },
        shadows: { value: d.shadows, min: 0.5, max: 2, step: 0.01 },
        highlights: { value: d.highlights, min: 0.5, max: 2.5, step: 0.01 },
        toe: { value: d.toe, min: 0, max: 0.2, step: 0.005 },
        knee: { value: d.knee, min: 0.5, max: 0.98, step: 0.01, label: "shoulder" },
        grain: { value: d.grain, min: 0, max: 0.1, step: 0.002 },
      }),
      "Stone · stone/optics": folder({
        stoneTop: { value: d.stoneTop, min: 0, max: 1.5, step: 0.01, label: "top light" },
        stoneAway: { value: d.stoneAway, min: 0, max: 1, step: 0.005, label: "shaded face" },
        stoneToward: { value: d.stoneToward, min: 0, max: 1, step: 0.005, label: "lit face" },
        sheenTop: { value: d.sheenTop, min: 0, max: 1.5, step: 0.01, label: "top sheen sky" },
        sheenFace: { value: d.sheenFace, min: 0, max: 1.5, step: 0.01, label: "face sheen sky" },
        footAway: { value: d.footAway, min: 0.2, max: 1, step: 0.01, label: "shaded foot keeps" },
        footToward: { value: d.footToward, min: 0.2, max: 1, step: 0.01, label: "lit foot keeps" },
      }),
      "Bloom · bloom/optics, bloom/motion": folder({
        /* Below 0: the visit's clock opens it (OPENING). */
        bloomOpen: { value: d.bloomOpen, min: -0.05, max: 1, step: 0.01, label: "open (<0 live)" },
        bloomSeed: { value: d.bloomSeed, min: 0, max: 1, step: 0.01, label: "flower (seed)" },
      }),
    },
    { store },
  );

  useEffect(() => {
    engine.setParams(values as Partial<StageParams>);
  }, [engine, values]);

  return <LevaPanel store={store} titleBar={{ title: "stage" }} />;
}
