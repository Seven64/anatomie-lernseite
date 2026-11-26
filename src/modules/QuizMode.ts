import { DataManager } from "../utils/DataManager";
import { SettingsManager } from "../utils/SettingsManager";
import { Structure, BodySystem, QuizResult, ProgressData } from "../types";
import { DRACO_DECODER_PATH, frameCameraToObject } from "../utils/three";
import * as THREE from "three";

type QuizModeType = "locate" | "identify";

export class QuizMode {
  private dataManager: DataManager;
  private settingsManager: SettingsManager;

  private currentMode: QuizModeType = "identify";
  private filterSystem: BodySystem | "all" = "all";
  private filterRegion: string = "all";
  private structures: Structure[] = [];
  private currentStructure: Structure | null = null;
  private currentQuestionIndex: number = 0;
  private score: number = 0;
  private total: number = 0;
  private options: Structure[] = [];
  private isActive: boolean = false;
  private progressData: ProgressData | null = null;

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

  private async initMode(): Promise<void> {
    this.progressData = await this.dataManager.loadProgress() || this.getEmptyProgress();
    this.bindFilters();
    this.bindQuizEvents();
    this.applyFilters();
  }

  private getEmptyProgress(): ProgressData {
    return {
      version: "1.0",
      userId: "local",
      quizResults: [],
      flashcardProgress: [],
      notes: {},
      bookmarks: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  private bindFilters(): void {
    const container = document.getElementById("canvas-container")!;
    container.innerHTML = this.getQuizHTML();
  }

  private getQuizHTML(): string {
    const systems = [...new Set(this.dataManager.getAllStructures().map(s => s.system))].sort();
    const regions = [...new Set(this.dataManager.getAllStructures().map(s => s.region).filter(Boolean))].sort();
    return `
      <div class="quiz-container" style="height: 100%; display: flex; flex-direction: column;">
        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; align-items: center;">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="mode-locate" data-mode="locate">Wo ist …?</button>
            <button class="btn btn-primary" id="mode-identify" data-mode="identify">Wie heißt …?</button>
          </div>
          <select class="select" id="filter-system" style="min-width: 180px;">
            <option value="all">Alle Systeme</option>
            ${systems.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>
          <select class="select" id="filter-region" style="min-width: 180px;">
            <option value="all">Alle Regionen</option>
            ${regions.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>
        </div>
        <div class="quiz-progress">
          <div class="quiz-progress-bar"><div class="quiz-progress-fill" id="quiz-progress" style="width: 0%"></div></div>
          <span class="quiz-progress-text" id="quiz-score">0 / 0</span>
        </div>
        <div class="quiz-question" id="quiz-question">Lade Frage...</div>
        <div style="flex: 1; position: relative; min-height: 300px;">
          <div class="canvas-container" id="quiz-canvas"></div>
          <div class="loading-overlay" id="quiz-loading" style="display: none;">
            <div class="loading-spinner"></div>
            <div class="loading-text">Lade 3D-Modell...</div>
          </div>
        </div>
        <div class="quiz-options" id="quiz-options" style="display: none;"></div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
          <input type="text" class="search-input" id="free-text-input" placeholder="Strukturnamen eingeben..." style="flex: 1; min-width: 200px; max-width: 400px; display: none;" autocomplete="off">
          <button class="btn btn-primary" id="submit-answer" style="display: none;">Prüfen</button>
          <button class="btn btn-secondary" id="next-question">Nächste Frage</button>
        </div>
        <div id="quiz-feedback" class="quiz-feedback" style="display: none;"></div>
      </div>
    `;
  }

  private bindQuizEvents(): void {
    document.getElementById("mode-locate")!.addEventListener("click", () => this.setQuizMode("locate"));
    document.getElementById("mode-identify")!.addEventListener("click", () => this.setQuizMode("identify"));
    document.getElementById("filter-system")!.addEventListener("change", (e) => { this.filterSystem = (e.target as HTMLSelectElement).value as BodySystem | "all"; this.applyFilters(); });
    document.getElementById("filter-region")!.addEventListener("change", (e) => { this.filterRegion = (e.target as HTMLSelectElement).value; this.applyFilters(); });
    document.getElementById("submit-answer")!.addEventListener("click", () => this.checkAnswer());
    document.getElementById("next-question")!.addEventListener("click", () => this.nextQuestion());
    document.getElementById("free-text-input")!.addEventListener("keydown", (e) => { if (e.key === "Enter") this.checkAnswer(); });
  }

  private setQuizMode(mode: QuizModeType): void {
    this.currentMode = mode;
    document.getElementById("mode-locate")!.classList.toggle("active", mode === "locate");
    document.getElementById("mode-identify")!.classList.toggle("active", mode === "identify");
    document.getElementById("free-text-input")!.style.display = mode === "identify" ? "none" : "block";
    document.getElementById("submit-answer")!.style.display = mode === "identify" ? "none" : "inline-flex";
    document.getElementById("quiz-options")!.style.display = mode === "identify" ? "grid" : "none";
    this.nextQuestion();
  }

  private applyFilters(): void {
    this.structures = this.dataManager.getAllStructuresSync().filter(s => {
      if (this.filterSystem !== "all" && s.system !== this.filterSystem) return false;
      if (this.filterRegion !== "all" && s.region !== this.filterRegion) return false;
      return true;
    });
    this.shuffleArray(this.structures);
    this.currentQuestionIndex = 0;
    this.score = 0;
    this.total = 0;
    if (this.isActive) this.nextQuestion();
  }

  private async nextQuestion(): Promise<void> {
    if (this.structures.length === 0) {
      document.getElementById("quiz-question")!.textContent = "Keine Strukturen für diese Filter";
      return;
    }

    if (this.currentQuestionIndex >= this.structures.length) {
      this.shuffleArray(this.structures);
      this.currentQuestionIndex = 0;
    }

    this.currentStructure = this.structures[this.currentQuestionIndex++];
    this.total++;

    if (this.currentMode === "locate") {
      const name = this.settingsManager.getLabel(this.currentStructure);
      document.getElementById("quiz-question")!.textContent = `Wo ist: ${name}?`;
      document.getElementById("quiz-options")!.style.display = "none";
      document.getElementById("free-text-input")!.style.display = "none";
      document.getElementById("submit-answer")!.style.display = "none";
      await this.loadLocateScene(this.currentStructure);
    } else {
      document.getElementById("quiz-question")!.textContent = "Wie heißt die markierte Struktur?";
      document.getElementById("quiz-options")!.style.display = "grid";
      document.getElementById("free-text-input")!.style.display = "none";
      document.getElementById("submit-answer")!.style.display = "none";
      await this.loadIdentifyScene(this.currentStructure);
    }

    document.getElementById("quiz-feedback")!.style.display = "none";
    this.updateProgress();
  }

  private async loadLocateScene(structure: Structure): Promise<void> {
    const canvasContainer = document.getElementById("quiz-canvas")!;
    canvasContainer.innerHTML = "";

    const loading = document.getElementById("quiz-loading")!;
    loading.style.display = "flex";

    try {
      const response = await fetch(`./models/${structure.glbFile}`);
      if (!response.ok) throw new Error("GLB not found");
      const arrayBuffer = await response.arrayBuffer();

      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      loader.setDRACOLoader(draco);

      const gltf = await loader.parseAsync(arrayBuffer, structure.glbFile.split('/')[0] + '/');

      const scene = new THREE.Scene();
      const background = getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim();
      scene.background = new THREE.Color(background || "#f5f7fb");

      const camera = new THREE.PerspectiveCamera(50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 2);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        targetMesh.userData.isTarget = true;
      }

      scene.add(gltf.scene);

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const handleClick = (event: MouseEvent) => {
        if (!this.isActive || this.currentMode !== "locate") return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          if (hit.userData.isTarget) {
            this.recordResult(true);
            this.showFeedback(true, structure.nameLatin);
            setTimeout(() => this.nextQuestion(), 1500);
          } else {
            this.showFeedback(false, structure.nameLatin);
          }
        }
      };

      renderer.domElement.addEventListener("click", handleClick);

      const controls = new (await import("three/examples/jsm/controls/OrbitControls.js")).OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      frameCameraToObject(camera, controls, gltf.scene);

      const animate = () => {
        if (!this.isActive) { renderer.dispose(); renderer.domElement.removeEventListener("click", handleClick); return; }
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

  private async loadIdentifyScene(structure: Structure): Promise<void> {
    const canvasContainer = document.getElementById("quiz-canvas")!;
    canvasContainer.innerHTML = "";

    const loading = document.getElementById("quiz-loading")!;
    loading.style.display = "flex";

    try {
      const response = await fetch(`./models/${structure.glbFile}`);
      if (!response.ok) throw new Error("GLB not found");
      const arrayBuffer = await response.arrayBuffer();

      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_PATH);
      loader.setDRACOLoader(draco);

      const gltf = await loader.parseAsync(arrayBuffer, structure.glbFile.split('/')[0] + '/');

      const scene = new THREE.Scene();
      const background = getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim();
      scene.background = new THREE.Color(background || "#f5f7fb");

      const camera = new THREE.PerspectiveCamera(50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 2);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
      frameCameraToObject(camera, controls, gltf.scene);

      await this.generateOptions(structure);

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

  private async generateOptions(correct: Structure): Promise<void> {
    const container = document.getElementById("quiz-options")!;
    const sameSystem = (await this.dataManager.getStructuresBySystem(correct.system)).filter(s => s.id !== correct.id);
    this.shuffleArray(sameSystem);
    this.options = [correct, ...sameSystem.slice(0, 3)];
    this.shuffleArray(this.options);

    container.innerHTML = this.options.map((opt, i) => `
      <button class="quiz-option" data-index="${i}">
        ${this.settingsManager.getLabel(opt)}
      </button>
    `).join("");

    container.querySelectorAll(".quiz-option").forEach(btn => {
      btn.addEventListener("click", () => this.selectOption(parseInt((btn as HTMLElement).dataset.index!)));
    });
  }

  private selectOption(index: number): void {
    document.querySelectorAll(".quiz-option").forEach(btn => btn.classList.remove("selected"));
    document.querySelector(`.quiz-option[data-index="${index}"]`)!.classList.add("selected");
    this.checkAnswer();
  }

  private checkAnswer(): void {
    if (this.currentMode === "identify") {
      const selected = document.querySelector(".quiz-option.selected");
      if (!selected) return;
      const index = parseInt((selected as HTMLElement).dataset.index!);
      const isCorrect = this.options[index].id === this.currentStructure!.id;
      this.recordResult(isCorrect);
      this.showFeedback(isCorrect, this.currentStructure!.nameLatin);
      selected.classList.add(isCorrect ? "correct" : "incorrect");
      document.querySelector(`.quiz-option[data-index="${this.options.findIndex(o => o.id === this.currentStructure!.id)}"]`)!.classList.add("correct");
      setTimeout(() => this.nextQuestion(), 1500);
    }
  }

  private recordResult(correct: boolean): void {
    if (!this.currentStructure) return;
    this.score += correct ? 1 : 0;
    const result: QuizResult = {
      structureId: this.currentStructure.id,
      mode: this.currentMode,
      correct,
      timestamp: new Date().toISOString(),
      responseTime: 0,
    };
    this.progressData!.quizResults.push(result);
    this.dataManager.saveProgress(this.progressData!);
  }

  private showFeedback(correct: boolean, correctName: string): void {
    const feedback = document.getElementById("quiz-feedback")!;
    feedback.style.display = "flex";
    feedback.innerHTML = `
      <span class="${correct ? "feedback-correct" : "feedback-incorrect"}">
        ${correct ? "✓ Richtig!" : "✗ Falsch"}
      </span>
      <span class="feedback-detail">${correct ? "" : `Richtige Antwort: ${correctName}`}</span>
    `;
  }

  private updateProgress(): void {
    const fill = document.getElementById("quiz-progress")!;
    const scoreEl = document.getElementById("quiz-score")!;
    fill.style.width = `${(this.currentQuestionIndex / Math.max(this.structures.length, 1)) * 100}%`;
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