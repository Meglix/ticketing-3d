import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette, wrapEffect } from '@react-three/postprocessing';
import { BlendFunction, Effect, EffectAttribute, ToneMappingMode, type BloomEffect } from 'postprocessing';
import { useRef } from 'react';
import { Uniform } from 'three';
import { look } from './look.ts';

/**
 * Post-processing for the night look. The scene renders into a half-float
 * (HDR) buffer, so emissive surfaces brighter than 1.0 (floodlights, LED
 * boards, glowing lines, the gold seat) are the only things above the bloom
 * threshold. Order matters:
 *
 *   bloom → speed blur  (HDR)   → ACES tone mapping → SMAA → vignette → grain
 *
 * Quality tiers drop the expensive parts on weak devices (see Stage.tsx).
 */

export type QualityTier = 'high' | 'medium' | 'low';

/** Radial "speed" blur toward the screen centre; strength follows camera speed. */
const speedBlurShader = /* glsl */ `
  uniform float strength;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (strength < 0.0004) { outputColor = inputColor; return; }
    vec2 dir = (uv - 0.5) * strength;
    vec4 acc = inputColor;
    for (int i = 1; i < 10; i++) {
      acc += texture2D(inputBuffer, uv - dir * float(i) / 9.0);
    }
    outputColor = acc / 10.0;
  }
`;

class SpeedBlurEffect extends Effect {
  constructor() {
    super('SpeedBlurEffect', speedBlurShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['strength', new Uniform(0)]]),
    });
  }
}

const SpeedBlur = wrapEffect(SpeedBlurEffect);

/** Camera speed (m/s) at which the blur reaches its maximum. */
const BLUR_FULL_SPEED = 140;
const BLUR_MAX = 0.07;

export function Effects({ tier }: { tier: QualityTier }) {
  const bloomRef = useRef<BloomEffect>(null);
  const blurRef = useRef<SpeedBlurEffect>(null);

  useFrame(() => {
    // Bloom swells as the floodlights power on during the intro.
    if (bloomRef.current) bloomRef.current.intensity = 0.25 + 1.05 * look.power;
    const u = blurRef.current?.uniforms.get('strength');
    if (u) u.value = Math.min(BLUR_MAX, (look.speed / BLUR_FULL_SPEED) * BLUR_MAX);
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        ref={bloomRef}
        mipmapBlur
        luminanceThreshold={1.0}
        luminanceSmoothing={0.12}
        intensity={1}
        levels={tier === 'low' ? 5 : tier === 'medium' ? 6 : 8}
        radius={0.72}
      />
      {tier !== 'low' ? <SpeedBlur ref={blurRef} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {tier !== 'low' ? <SMAA /> : <></>}
      <Vignette offset={0.32} darkness={0.72} eskil={false} />
      {tier === 'high' ? <Noise premultiply opacity={0.1} blendFunction={BlendFunction.OVERLAY} /> : <></>}
    </EffectComposer>
  );
}
