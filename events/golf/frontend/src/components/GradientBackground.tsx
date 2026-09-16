import { useEffect, useRef } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';

// A WebGL "aurora" - fractal simplex noise with domain warping, rendered per-pixel on the GPU. This
// replaces an earlier attempt at a handful of hand-positioned canvas-2D radial-gradient blobs, which
// (however their motion was tuned) fundamentally reads as "a few colored circles moving around", not
// a genuinely fluid field. Domain warping - sampling the noise field at a position that's *itself*
// offset by another noise field - is the actual technique behind most of the flowing "mesh
// gradient"/aurora effects on sites like Stripe or Linear; it's what turns plain noise (which just
// looks like TV static/clouds) into something that looks like it's swirling and flowing.
//
// Same gradient DNA as the core Arrow Cloud site's own hero background
// (frontend/src/components/layout/AuthPageLayout.tsx: a sweep through the theme's
// primary/secondary/accent tokens) - approximated here with a small green/teal palette matching
// this app's own DaisyUI theme (App.css's event-light/event-dark), since a GLSL shader can't
// consume DaisyUI's oklch custom properties directly.

const VERTEX_SHADER = `#version 300 es
// A single oversized triangle covering the whole clip-space viewport - cheaper than a quad (no
// diagonal seam, no second triangle to rasterize) since only the parts inside [-1,1] are ever seen.
const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uOffset;
out vec4 fragColor;

// Ashima Arts' 2D simplex noise (the standard, widely-published GLSL implementation) - not written
// from scratch here since re-deriving simplex noise's skew/unskew math from first principles buys
// nothing over the well-tested reference version.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Fractal Brownian motion - several noise octaves at doubling frequency/halving amplitude, the
// standard way to turn one noise call into organic, detailed-but-still-smooth texture.
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * snoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 st = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  st += uOffset;

  float slowTime = uTime * 0.045;
  // Domain warping: sample fbm at a position that's itself offset by two more fbm lookups - this is
  // what makes the field look like it's flowing/swirling rather than just a static mottled texture
  // that happens to animate in place.
  vec2 warp = vec2(fbm(st * 1.6 + vec2(0.0, slowTime)), fbm(st * 1.6 + vec2(5.2, -slowTime)));
  float n = fbm(st * 1.3 + warp * 0.8 + vec2(slowTime * 0.6, -slowTime * 0.4));

  vec3 deepGreen = vec3(0.086, 0.396, 0.204);
  vec3 teal = vec3(0.051, 0.580, 0.533);
  vec3 brightGreen = vec3(0.290, 0.871, 0.502);

  vec3 color = mix(deepGreen, teal, smoothstep(-0.5, 0.5, n));
  color = mix(color, brightGreen, smoothstep(0.15, 0.85, warp.x * 0.5 + 0.5));

  float alpha = 0.4 + 0.22 * n;
  fragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

// Waypoints the pan offset travels through smoothly across the page's full scroll range - one per
// HomePage section, in scroll order, but reached by continuous interpolation against actual scroll
// position (see useScrollProgress + lerpOffset below), not by snapping to a target the moment
// IntersectionObserver decides a new section is "most visible" and then easing to catch up. That
// snap-then-chase was the actual problem with the first version of this: the pan always looked like
// it was reacting late to whatever you'd already scrolled past, instead of moving with you.
const WAYPOINTS: { x: number; y: number }[] = [
  { x: -0.18, y: -0.15 }, // hero
  { x: 0.2, y: -0.12 }, // scoring
  { x: -0.22, y: 0.16 }, // judging your hits
  { x: 0.18, y: 0.22 }, // event rules
  { x: -0.1, y: -0.25 }, // timeline
];

function lerpOffset(progress: number): { x: number; y: number } {
  const scaled = Math.min(Math.max(progress, 0), 1) * (WAYPOINTS.length - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(i0 + 1, WAYPOINTS.length - 1);
  const t = scaled - i0;
  const a = WAYPOINTS[i0];
  const b = WAYPOINTS[i1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export default function GradientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollProgressRef = useScrollProgress();

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!canvas || !gl) return;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('GradientBackground: program link error', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const uResolution = gl.getUniformLocation(program, 'uResolution');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uOffset = gl.getUniformLocation(program, 'uOffset');

    // Capped, not raw devicePixelRatio - this shader runs full-screen every frame, so a 3x canvas
    // is real GPU cost (9x the fragment shader invocations) for detail this soft that's invisible.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const current = { x: 0, y: 0 };
    let raf = 0;
    let lastFrameTime = 0;
    const FRAME_INTERVAL_MS = 1000 / 30; // this motion is slow/soft enough that 30fps reads as smooth

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastFrameTime < FRAME_INTERVAL_MS) return;
      lastFrameTime = now;

      // Driven directly by actual scroll position (not a discrete "which section is active" step),
      // so the pan tracks the scrollbar in real time instead of lagging behind it. The light
      // smoothing here only irons out per-frame jitter from scroll-event granularity - at this
      // factor it settles in a couple frames, nowhere near enough to read as a delayed chase.
      const wanted = lerpOffset(scrollProgressRef.current);
      current.x += (wanted.x - current.x) * 0.15;
      current.y += (wanted.y - current.y) * 0.15;

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, now / 1000);
      gl.uniform2f(uOffset, current.x, current.y);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-base-100">
      <canvas ref={canvasRef} />
      {/* Same radial-dot texture as AuthPageLayout.tsx */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.1)_1px,transparent_0)] [background-size:20px_20px] opacity-20" />
    </div>
  );
}
