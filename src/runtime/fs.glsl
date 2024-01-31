precision highp float;

in vec4 vColor;
in vec2 vPosition;

void main () {
  float A = -dot(vPosition, vPosition);
  if (A < -4.0) discard;
  float B = exp(A) * vColor.a;
  gl_FragColor = vec4(B * vColor.rgb, B);
}