import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, Color, type HemisphereLight, type Mesh, ShaderMaterial, type SpotLight, Object3D } from 'three';
import type { Venue } from '../venue/loadVenue.ts';
import { look } from './look.ts';

/**
 * V2 night environment: the stadium floats in darkness. No ground, no
 * surroundings — only a near-black dome with a faint, warm haze low on the
 * horizon (the glow of the stadium lights in the air) and a cooler zenith.
 *
 * Lighting for a night match:
 * - four cool-white spotlights from the roof frames, aimed at the pitch:
 *   the pitch is brightly lit, the stands fall off into darkness;
 * - a very dim cool hemisphere so the structure is never pure black;
 * - the floodlight fittings themselves are emissive (Fixtures.tsx), and the
 *   bloom pass turns them into light strips.
 * All of it ramps up with `look.power` during the intro.
 */

/** Inside the camera's far plane (5000 m) with margin; the dome follows the camera. */
const SKY_RADIUS = 4000;

function nightDomeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: new Color('#020306') },
      horizon: { value: new Color('#0b1018') },
      haze: { value: new Color('#2a1d12') },
      power: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 haze;
      uniform float power;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -1.0, 1.0);
        // Below the horizon: black. Above: horizon tone fading to the zenith.
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
        col = mix(vec3(0.0), col, smoothstep(-0.25, 0.02, h));
        // Warm light haze hugging the horizon once the floodlights are on.
        col += haze * power * exp(-abs(h) * 9.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** One spotlight per roof frame, on the leading edge, aimed at the centre spot. */
function spotPositions(venue: Venue): [number, number, number][] {
  const ref = venue.config.layout.referenceLine;
  const roof = venue.config.roof;
  const y = roof ? roof.inner.height - 1 : 30;
  const inset = roof ? roof.inner.distance : 0;
  return [
    [0, y, -(ref.halfWidth + inset)],
    [0, y, ref.halfWidth + inset],
    [ref.halfLength + inset, y, 0],
    [-(ref.halfLength + inset), y, 0],
  ];
}

const SPOT_INTENSITY = 3.1;

export function Environment({ venue }: { venue: Venue }) {
  const dome = useMemo(nightDomeMaterial, []);
  const domeRef = useRef<Mesh>(null);
  const spots = useMemo(() => spotPositions(venue), [venue]);
  const spotRefs = useRef<(SpotLight | null)[]>([]);
  const hemiRef = useRef<HemisphereLight>(null);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(0, 0, 0);
    return o;
  }, []);

  useFrame(({ camera }) => {
    domeRef.current?.position.copy(camera.position);
    dome.uniforms.power!.value = look.power;
    spotRefs.current.forEach((s) => {
      if (s) s.intensity = SPOT_INTENSITY * look.power;
    });
    // Dim ambient: the floodlit pitch, not the stands, sets the exposure.
    if (hemiRef.current) hemiRef.current.intensity = 0.14 + 0.22 * look.power;
  });

  useEffect(() => () => dome.dispose(), [dome]);

  return (
    <group>
      <primitive object={target} />
      <mesh ref={domeRef} material={dome} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemiRef} args={['#7d93b8', '#0a0a0c', 0.2]} />
      {spots.map((p, i) => (
        <spotLight
          key={i}
          ref={(el) => {
            spotRefs.current[i] = el;
          }}
          position={p}
          target={target}
          color="#e0eaff"
          intensity={0}
          angle={0.66}
          penumbra={0.9}
          decay={0}
          distance={0}
        />
      ))}
    </group>
  );
}
