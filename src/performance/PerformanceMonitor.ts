export interface PerformanceSnapshot {
  fps: number;
  simulationMs: number;
  renderMs: number;
  hudMs: number;
  displayObjects: number;
  version: number;
}

const SNAPSHOT_INTERVAL_MS = 500;
const SMOOTHING = 0.18;

function smooth(previous: number, next: number): number {
  if (previous <= 0) {
    return next;
  }

  return previous * (1 - SMOOTHING) + next * SMOOTHING;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private lastFpsAt = performance.now();
  private fps = 0;
  private simulationMs = 0;
  private renderMs = 0;
  private hudMs = 0;
  private displayObjects = 0;
  private version = 0;

  beginFrame(now = performance.now()): void {
    this.frameCount += 1;
    const elapsed = now - this.lastFpsAt;
    if (elapsed < SNAPSHOT_INTERVAL_MS) {
      return;
    }

    this.fps = Math.round((this.frameCount * 1000) / elapsed);
    this.frameCount = 0;
    this.lastFpsAt = now;
    this.version += 1;
  }

  recordSimulation(durationMs: number): void {
    this.simulationMs = smooth(this.simulationMs, durationMs);
  }

  recordRender(durationMs: number): void {
    this.renderMs = smooth(this.renderMs, durationMs);
  }

  recordHud(durationMs: number): void {
    this.hudMs = smooth(this.hudMs, durationMs);
  }

  setDisplayObjectCount(count: number): void {
    if (this.displayObjects !== count) {
      this.displayObjects = count;
      this.version += 1;
    }
  }

  getSnapshot(): PerformanceSnapshot {
    return {
      fps: this.fps,
      simulationMs: Number(this.simulationMs.toFixed(2)),
      renderMs: Number(this.renderMs.toFixed(2)),
      hudMs: Number(this.hudMs.toFixed(2)),
      displayObjects: this.displayObjects,
      version: this.version,
    };
  }

  formatSummary(): string {
    const snapshot = this.getSnapshot();
    return `FPS ${snapshot.fps || '--'} | objs ${snapshot.displayObjects}`;
  }
}
