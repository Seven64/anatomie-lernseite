import * as THREE from "three";
import {
  classifyWheel,
  clampDistance,
  decay,
  easeInOutCubic,
  normalizeWheelDelta,
  rotationAngle,
  worldPerPixel,
  zoomFactor,
} from "./cameraMath";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;
const KEY_ROTATE = Math.PI / 24;
/** Höchstgeschwindigkeit der Trägheit (Bogenmaß/s) – verhindert Überdrehen nach schnellem Wischen. */
const MAX_INERTIA = 3;

type DragMode = "rotate" | "pan";

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromOffset: THREE.Vector3;
  toOffset: THREE.Vector3;
  fromUp: THREE.Vector3;
  toUp: THREE.Vector3;
  start: number;
  duration: number;
}

/**
 * Kamerasteuerung für Maus, Touchpad und Touchscreen.
 *
 * - Drehen frei um das Ziel (keine Polsperre): Gieren um die Hochachse, Nicken um die
 *   Bildschirm-Querachse – auch „über Kopf“ bleibt die Zugrichtung intuitiv.
 * - Zoomen immer zum Zeiger hin; Touchpad-Pinch (Strg + Rad) feiner, horizontale
 *   Zwei-Finger-Geste dreht.
 * - Touch: ein Finger dreht, zwei Finger zoomen (Pinch) und verschieben.
 * - Trägheit nach dem Loslassen, Kameraflüge mit Zielausrichtung (für ViewCube & Fokus).
 */
export class CameraControls {
  readonly target = new THREE.Vector3();
  minDistance = 0.02;
  maxDistance = 30;
  rotateSpeed = 1;
  autoRotate = false;
  /** Bogenmaß pro Sekunde. */
  autoRotateSpeed = 0.35;
  enabled = true;
  /** Doppelklick bzw. Doppeltipp (Bildschirmkoordinaten). */
  onDoubleActivate: ((clientX: number, clientY: number) => void) | null = null;
  /** Wird bei jeder Interaktion aufgerufen (z. B. zum Ausblenden von Hinweisen). */
  onInteraction: (() => void) | null = null;

  private readonly pointers = new Map<number, { x: number; y: number; type: string }>();
  private drag: { mode: DragMode; x: number; y: number; time: number } | null = null;
  private pinch: { distance: number; x: number; y: number } | null = null;
  private velocity = { yaw: 0, pitch: 0 };
  private flight: Flight | null = null;
  private lastTap: { time: number; x: number; y: number } | null = null;
  private lastTime = performance.now();
  private readonly events = new AbortController();

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly element: HTMLElement) {
    element.style.touchAction = "none";
    element.tabIndex = element.tabIndex >= 0 ? element.tabIndex : 0;
    const { signal } = this.events;
    element.addEventListener("pointerdown", event => this.onPointerDown(event), { signal });
    element.addEventListener("pointermove", event => this.onPointerMove(event), { signal });
    element.addEventListener("pointerup", event => this.onPointerUp(event), { signal });
    element.addEventListener("pointercancel", event => this.onPointerUp(event), { signal });
    element.addEventListener("wheel", event => this.onWheel(event), { signal, passive: false });
    element.addEventListener("contextmenu", event => event.preventDefault(), { signal });
    element.addEventListener("dblclick", event => this.onDoubleActivate?.(event.clientX, event.clientY), { signal });
    element.addEventListener("keydown", event => this.onKeyDown(event), { signal });
  }

  get distance(): number {
    return this.camera.position.distanceTo(this.target);
  }

  get isInteracting(): boolean {
    return this.pointers.size > 0 || this.flight !== null;
  }

  /** In jedem Frame aufrufen: Trägheit, Auto-Rotation und Kameraflüge. */
  update(now = performance.now()): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.flight) {
      this.stepFlight(now);
      return;
    }
    if (this.pointers.size === 0 && (this.velocity.yaw !== 0 || this.velocity.pitch !== 0)) {
      this.rotate(this.velocity.yaw * dt, this.velocity.pitch * dt);
      this.velocity.yaw = decay(this.velocity.yaw, dt);
      this.velocity.pitch = decay(this.velocity.pitch, dt);
    } else if (this.autoRotate && this.pointers.size === 0) {
      this.rotate(this.autoRotateSpeed * dt, 0);
    }
  }

  /** Dreht um das Ziel: `yaw` um die Hochachse, `pitch` um die Bildschirm-Querachse (Bogenmaß). */
  rotate(yaw: number, pitch: number): void {
    const offset = this.camera.position.clone().sub(this.target);
    // Über Kopf (Kamera-Oben zeigt nach unten) die Gierachse umdrehen, damit Ziehen intuitiv bleibt.
    const yawAxis = Math.abs(this.camera.up.y) > 0.2 ? WORLD_UP.clone().multiplyScalar(Math.sign(this.camera.up.y)) : this.camera.up.clone();
    const right = new THREE.Vector3().crossVectors(this.camera.up, offset).normalize();
    const rotation = new THREE.Quaternion()
      .setFromAxisAngle(yawAxis, -yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right, -pitch));
    offset.applyQuaternion(rotation);
    this.camera.up.applyQuaternion(rotation).normalize();
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  /** Verschiebt Kamera und Ziel um Bildschirmpixel. */
  pan(dxPixels: number, dyPixels: number): void {
    const scale = worldPerPixel(this.distance, this.camera.fov, this.element.clientHeight);
    const offset = this.camera.position.clone().sub(this.target);
    const right = new THREE.Vector3().crossVectors(this.camera.up, offset).normalize();
    const up = new THREE.Vector3().crossVectors(offset, right).normalize();
    const move = right.multiplyScalar(dxPixels * scale).add(up.multiplyScalar(dyPixels * scale));
    this.camera.position.add(move);
    this.target.add(move);
  }

  /** Zoomt um `factor` (< 1 = hinein) zum Bildschirmpunkt hin, der unter dem Zeiger bleibt. */
  zoom(factor: number, clientX?: number, clientY?: number): void {
    const applied = clampDistance(this.distance, factor, this.minDistance, this.maxDistance);
    if (applied === 1) return;
    let anchor = this.target.clone();
    if (clientX !== undefined && clientY !== undefined) {
      const rect = this.element.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const normal = this.camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.target);
      anchor = ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? anchor;
    }
    // Kamera und Ziel bewegen sich zum Anker hin – der Punkt unter dem Zeiger bleibt stehen.
    this.camera.position.sub(anchor).multiplyScalar(applied).add(anchor);
    this.target.sub(anchor).multiplyScalar(applied).add(anchor);
    this.camera.updateMatrixWorld();
  }

  /** Bricht Trägheit und Flüge ab (z. B. vor externen Kamerasprüngen). */
  stop(): void {
    this.velocity = { yaw: 0, pitch: 0 };
    this.flight = null;
  }

  /**
   * Fliegt animiert zu einer neuen Ansicht. `direction` = Blickrichtung vom Ziel zur Kamera,
   * `up` = gewünschte Hochrichtung, `distance`/`target` optional (Standard: unverändert).
   */
  flyTo(options: { direction?: THREE.Vector3; up?: THREE.Vector3; target?: THREE.Vector3; distance?: number; duration?: number }): void {
    const fromOffset = this.camera.position.clone().sub(this.target);
    const distance = options.distance ?? fromOffset.length();
    const direction = (options.direction ?? fromOffset).clone().normalize();
    let up = (options.up ?? this.camera.up).clone().normalize();
    // Hochrichtung senkrecht zur Blickrichtung machen.
    up.sub(direction.clone().multiplyScalar(up.dot(direction)));
    if (up.lengthSq() < 1e-6) up = new THREE.Vector3(0, 0, -Math.sign(direction.y) || -1);
    up.normalize();
    this.velocity = { yaw: 0, pitch: 0 };
    this.flight = {
      fromTarget: this.target.clone(),
      toTarget: (options.target ?? this.target).clone(),
      fromOffset,
      toOffset: direction.multiplyScalar(distance),
      fromUp: this.camera.up.clone(),
      toUp: up,
      start: performance.now(),
      duration: options.duration ?? 450,
    };
  }

  dispose(): void {
    this.events.abort();
  }

  // --- Ereignisse -----------------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    if (!this.enabled) return;
    this.element.focus({ preventScroll: true });
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // Synthetische Ereignisse (Tests) haben keinen aktiven Zeiger – ohne Capture weiter.
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    this.flight = null;
    this.velocity = { yaw: 0, pitch: 0 };
    this.onInteraction?.();

    if (event.pointerType === "touch") this.detectDoubleTap(event);
    if (this.pointers.size === 2) {
      this.drag = null;
      this.pinch = this.pinchState();
      return;
    }
    const pan = event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey;
    this.drag = { mode: pan ? "pan" : "rotate", x: event.clientX, y: event.clientY, time: event.timeStamp };
  }

  private onPointerMove(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer || !this.enabled) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size >= 2 && this.pinch) {
      const next = this.pinchState();
      if (next.distance > 0 && this.pinch.distance > 0) this.zoom(this.pinch.distance / next.distance, next.x, next.y);
      this.pan(-(next.x - this.pinch.x), next.y - this.pinch.y);
      this.pinch = next;
      return;
    }
    if (!this.drag) return;

    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    const dt = Math.max((event.timeStamp - this.drag.time) / 1000, 1e-3);
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    this.drag.time = event.timeStamp;

    if (this.drag.mode === "pan") {
      this.pan(-dx, dy);
    } else {
      const height = this.element.clientHeight;
      const yaw = rotationAngle(dx, height, this.rotateSpeed);
      const pitch = rotationAngle(dy, height, this.rotateSpeed);
      this.rotate(yaw, pitch);
      // Geschwindigkeit für die Trägheit glätten.
      const clamp = (value: number) => Math.max(-MAX_INERTIA, Math.min(MAX_INERTIA, value));
      this.velocity.yaw = clamp(this.velocity.yaw * 0.5 + (yaw / dt) * 0.5);
      this.velocity.pitch = clamp(this.velocity.pitch * 0.5 + (pitch / dt) * 0.5);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    // Keine Trägheit, wenn der Zeiger vor dem Loslassen still stand.
    if (this.drag && event.timeStamp - this.drag.time > 60) this.velocity = { yaw: 0, pitch: 0 };
    if (this.pointers.size === 1) {
      // Von zwei auf einen Finger: nahtlos mit Drehen weitermachen.
      const [remaining] = this.pointers.values();
      this.drag = { mode: "rotate", x: remaining.x, y: remaining.y, time: event.timeStamp };
      this.velocity = { yaw: 0, pitch: 0 };
    } else {
      this.drag = null;
    }
    this.pinch = null;
  }

  private onWheel(event: WheelEvent): void {
    if (!this.enabled) return;
    event.preventDefault();
    this.flight = null;
    this.onInteraction?.();
    const height = window.innerHeight;
    const dx = normalizeWheelDelta(event.deltaX, event.deltaMode, height);
    const dy = normalizeWheelDelta(event.deltaY, event.deltaMode, height);
    const intent = classifyWheel(dx, dy, event.ctrlKey);
    if (intent === "rotate") {
      this.rotate(rotationAngle(-dx, this.element.clientHeight, 0.5 * this.rotateSpeed), 0);
    } else {
      this.zoom(zoomFactor(dy, intent === "pinch"), event.clientX, event.clientY);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.enabled || event.altKey) return;
    const step = event.shiftKey ? KEY_ROTATE / 4 : KEY_ROTATE;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.rotate(-step, 0),
      ArrowRight: () => this.rotate(step, 0),
      ArrowUp: () => this.rotate(0, -step),
      ArrowDown: () => this.rotate(0, step),
      "+": () => this.zoom(0.85),
      "=": () => this.zoom(0.85),
      "-": () => this.zoom(1 / 0.85),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    this.flight = null;
    action();
  }

  private detectDoubleTap(event: PointerEvent): void {
    const now = event.timeStamp;
    const last = this.lastTap;
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < DOUBLE_TAP_PX) {
      this.lastTap = null;
      this.onDoubleActivate?.(event.clientX, event.clientY);
    } else {
      this.lastTap = { time: now, x: event.clientX, y: event.clientY };
    }
  }

  private pinchState(): { distance: number; x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private stepFlight(now: number): void {
    const flight = this.flight!;
    const t = easeInOutCubic((now - flight.start) / flight.duration);
    this.target.lerpVectors(flight.fromTarget, flight.toTarget, t);
    // Richtung per Kugelinterpolation, Abstand linear.
    const fromDir = flight.fromOffset.clone().normalize();
    const toDir = flight.toOffset.clone().normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(fromDir, toDir);
    const direction = fromDir.applyQuaternion(new THREE.Quaternion().slerp(turn, t));
    const distance = THREE.MathUtils.lerp(flight.fromOffset.length(), flight.toOffset.length(), t);
    const upTurn = new THREE.Quaternion().setFromUnitVectors(flight.fromUp.clone().normalize(), flight.toUp);
    this.camera.up.copy(flight.fromUp).applyQuaternion(new THREE.Quaternion().slerp(upTurn, t)).normalize();
    this.camera.position.copy(this.target).addScaledVector(direction, distance);
    this.camera.lookAt(this.target);
    if (t >= 1) this.flight = null;
  }
}
