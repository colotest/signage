// What the pages drawn by a WebGL shader (Glitter, the Lava Lamp) share:
// whether this browser can run one at all, the context they ask for, and
// one full-screen pass of a fragment shader to put a picture in it.

// Whether this browser can run the shaders at all, found out once with a
// throwaway context and given straight back. They need highp floats in the
// fragment shader — screen positions, and Glitter's cell hashes, are
// garbage at half precision — and the browser is asked to refuse outright
// rather than fall back on drawing WebGL in software, which on a stick
// would be far slower than the canvas renderers.
let webglVerdict: boolean | undefined;

export function webglUsable() {
  if (webglVerdict !== undefined) return webglVerdict;
  if (typeof document === "undefined") return false;
  const gl = getWebgl(document.createElement("canvas"));
  const high = gl?.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  webglVerdict = !!high && high.precision >= 23;
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return webglVerdict;
}

export function getWebgl(canvas: HTMLCanvasElement) {
  const options: WebGLContextAttributes = {
    // Opaque: the shader paints the ground itself, and an opaque canvas
    // composites as a plain copy rather than a blend.
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: "low-power",
  };
  return (canvas.getContext("webgl", options) ??
    canvas.getContext("experimental-webgl", options)) as WebGLRenderingContext | null;
}

const VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// A fragment shader run over the whole canvas, with its uniforms looked up
// by name. Null if the browser has no WebGL for this canvas or the shader
// won't build, which the page takes as its cue to draw the other way.
export function createPass<Name extends string>(
  canvas: HTMLCanvasElement,
  label: string,
  fragment: string,
  names: readonly Name[],
) {
  const gl = getWebgl(canvas);
  if (!gl) return null;
  const program = gl.createProgram();
  const parts = [compile(gl, gl.VERTEX_SHADER, VERTEX, label), compile(gl, gl.FRAGMENT_SHADER, fragment, label)];
  if (!program || parts.some((part) => !part)) return null;
  for (const part of parts) gl.attachShader(program, part!);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(`${label}: shader didn't link`, gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  // One triangle twice the screen's size covers all of it, with no seam
  // down a diagonal for two triangles to meet along.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const at = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
    Name,
    WebGLUniformLocation | null
  >;

  return {
    gl,
    at,
    draw(width: number, height: number) {
      gl.viewport(0, 0, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      parts.forEach((part) => gl.deleteShader(part));
    },
  };
}

function compile(gl: WebGLRenderingContext, kind: number, source: string, label: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(`${label}: shader didn't compile`, gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}
