import { DataManager } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure } from "../types";
import { DRACO_DECODER_PATH, frameCameraToObject } from "../utils/three";
import * as THREE from "three";

export class LabelQuizMode {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private currentStructure: Structure | null = null;
  private structures: Structure[] = [];
  private currentIndex: number = 0;
  private score: number = 0;
  private total: number = 0;
  private isActive: boolean = false;

  constructor(dataManager: DataManager, settingsManager: SettingsManager) {
    this.dataManager = dataManager;
    this.settingsManager = settingsManager;
  }

  setActive(active: boolean): void {
    this.isActive = active;
    if (active) {
      this.initMode();
    } else {
      this.cleanup();
    }
  }

  private initMode(): void {
    this.structures = this.dataManager.getAllStructures().filter(s => s.nameLatin);
    this.shuffleArray(this.structures);
    this.currentIndex = 0;
    this.score = 0;
    this.total = 0;
    this.bindEvents();
    this.nextQuestion();
  }

  private bindEvents(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getQuizHTML();
    this.bindQuizEvents();
  }

  private getQuizHTML(): string {
    return `
      <div class="quiz-container" style="height: 100%; display: flex; flex-direction: column;">
        <div class="quiz-progress">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" id="quiz-progress" style="width: 0%"></div></div>
          <span class="quiz-progress-text" id="quiz-score">0 / 0</span>
        </div>
        <div class="quiz-question" id="quiz-question">Lade Frage...</div>
        <div style="flex: 1; position: relative;">
          <div class="canvas-container" id="label-quiz-canvas"></div>
          <div class="loading-overlay" id="quiz-loading" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text">Lade 3D-Modell...</div>
          </div>
        </div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
          <input type="text" class="search-input" id="answer-input" placeholder="Strukturnamen eingeben..." style="flex: 1; min-width: 200px; max-width: 400px;" autocomplete="off">
          <button class="btn btn-primary" id="submit-answer">Prüfen</button>
          <button class="btn btn-secondary" id="skip-question">Überspringen</button>
        </div>
        <div id="quiz-feedback" class="quiz-feedback" style="display: none;"></div>
      </div>
    `;
  }

  private bindQuizEvents(): void {
    const input = document.getElementById("answer-input") as HTMLInputElement;
    input.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") this.checkAnswer(); });
    document.getElementById("submit-answer")!.addEventListener("click", () => this.checkAnswer());
    document.getElementById("skip-question")!.addEventListener("click", () => this.nextQuestion());
  }

  private async nextQuestion(): Promise<void> {
    if (this.currentIndex >= this.structures.length) {
      this.shuffleArray(this.structures);
      this.currentIndex = 0;
    }

    this.currentStructure = this.structures[this.currentIndex++];
    this.total++;

    const questionText = this.settingsManager.getLabel(this.currentStructure);
    document.getElementById("quiz-question")!.textContent = `Wo ist: ${questionText}?`;
    (document.getElementById("answer-input") as HTMLInputElement).value = "";
    document.getElementById("quiz-feedback")!.style.display = "none";
    this.updateProgress();

    await this.loadStructureModel(this.currentStructure);
  }

  private async loadStructureModel(structure: Structure): Promise<void> {
    const canvasContainer = document.getElementById("label-quiz-canvas")!;
    canvasContainer.innerHTML = "";

    const loading = document.getElementById("quiz-loading")!;
    loading.style.display = "flex";

    try {
      const response = await fetch(`./models/${structure.glbFile}`);
      if (!response.ok) throw new Error("GLB not found");
      const arrayBuffer = await response.arrayBuffer();
      console.log('Loaded glb:', structure.glbFile, 'size:', arrayBuffer.byteLength);

      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      loader.setDRACOLoader(draco);

      const gltf = await loader.parseAsync(arrayBuffer, structure.glbFile.split('/')[0] + '/');
      console.log('Parsed GLTF:', gltf.scene.children.length, 'children');

      const scene = new THREE.Scene();
      const background = getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim();
      scene.background = new THREE.Color(background || "#f5f7fb");

      const camera = new THREE.PerspectiveCamera(50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 2);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      canvasContainer.appendChild(renderer.domElement);

      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(5, 10, 7);
      dirLight.castShadow = true;
      scene.add(dirLight);

      const targetMesh = gltf.scene.getObjectByName(structure.objectName) as THREE.Mesh;
      if (targetMesh) {
        targetMesh.material = new THREE.MeshStandardMaterial({
          color: 0xc89040,
          emissive: 0xc89040,
          emissiveIntensity: 0.2,
        });
      }

      scene.add(gltf.scene);

      const controls = new (await import("three/examples/jsm/controls/OrbitControls.js")).OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = true;
      controls.enableZoom = true;
      frameCameraToObject(camera, controls, gltf.scene);

      const animate = () => {
        if (!this.isActive) { renderer.dispose(); return; }
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      loading.style.display = "none";
    } catch (error) {
      console.error("Failed to load quiz model:", error);
      loading.style.display = "none";
      canvasContainer.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--fg-muted);">Modell konnte nicht geladen werden</div>`;
    }
  }

  private checkAnswer(): void {
    const input = document.getElementById("answer-input") as HTMLInputElement;
    const answer = input.value.trim().toLowerCase();
    if (!answer) return;

    const correctNames = [
      this.currentStructure!.nameLatin.toLowerCase(),
      this.currentStructure!.nameEn?.toLowerCase() || "",
      this.currentStructure!.nameDe?.toLowerCase() || "",
    ].filter(Boolean);

    const isCorrect = this.fuzzyMatch(answer, correctNames);
    this.score += isCorrect ? 1 : 0;

    this.showFeedback(isCorrect, correctNames[0]);
    setTimeout(() => this.nextQuestion(), 1500);
  }

  private fuzzyMatch(input: string, targets: string[]): boolean {
    const normalized = input.replace(/[äöüß]/g, c => ({ä:"ae",ö:"oe",ü:"ue",ß:"ss"}[c] || c));
    return targets.some(t => {
      const nt = t.replace(/[äöüß]/g, c => ({ä:"ae",ö:"oe",ü:"ue",ß:"ss"}[c] || c));
      return nt.includes(normalized) || normalized.includes(nt) || this.levenshtein(normalized, nt) <= 2;
    });
  }

  private levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i-1] + 1,
          matrix[j-1][i] + 1,
          matrix[j-1][i-1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }

  private showFeedback(correct: boolean, correctName: string): void {
    const feedback = document.getElementById("quiz-feedback")!;
    feedback.style.display = "flex";
    feedback.innerHTML = `
      <span class="${correct ? "feedback-correct" : "feedback-incorrect"}">
        ${correct ? "✓ Richtig!" : "✗ Falsch"}
      </span>
      <span class="feedback-detail">Richtige Antwort: ${correctName}</span>
    `;
  }

  private updateProgress(): void {
    const fill = document.getElementById("quiz-progress")!;
    const scoreEl = document.getElementById("quiz-score")!;
    fill.style.width = `${(this.currentIndex / Math.max(this.structures.length, 1)) * 100}%`;
    scoreEl.textContent = `${this.score} / ${this.total}`;
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private cleanup(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = "";
  }
}