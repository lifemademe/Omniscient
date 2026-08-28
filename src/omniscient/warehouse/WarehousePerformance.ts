import * as ENGINE from '@gnsx/genesys.js';
import * as THREE from 'three';

/** Editor-only bounded samples. CPU update and presentation intervals are not GPU timings. */
export class WarehousePerformance {
  private intervals: number[] = [];
  private updates: number[] = [];
  private draws: number[] = [];
  private previous = 0;
  private view = '';
  public begin(): number { return ENGINE.isPublishedGame() ? 0 : performance.now(); }
  public end(start: number, view: string, root: ENGINE.SceneNode): void {
    if (!start || document.hidden) { this.previous = 0; return; }
    if (view !== this.view) { this.intervals = []; this.updates = []; this.draws = []; this.previous = 0; this.view = view; }
    if (this.previous) this.intervals.push(start - this.previous);
    this.previous = start;
    this.updates.push(performance.now() - start);
    const renderer = root.getWorld()?.getRenderer();
    const gpu = renderer?.asWebGPU();
    const gl = renderer?.asWebGL();
    const currentDraws = gpu?.info.render.drawCalls ?? gl?.info.render.calls;
    if (currentDraws !== undefined) {
      // GameLoop.renderFrame calls Stats.updateRenderStats (and info.reset) before
      // each render. At the following gameplay tick this is the preceding frame's
      // total across scene, shadow and post passes, not a cumulative lifetime count.
      this.draws.push(currentDraws);
    }
    if (this.intervals.length < 300) return;
    const percentile = (values: number[], p: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      return Number((sorted[Math.floor((sorted.length - 1) * p)] ?? 0).toFixed(2));
    };
    const materials = new Set<THREE.Material>();
    let lights = 0;
    let shadowLights = 0;
    let meshCount = 0;
    const lightNames: string[] = [];
    const meshNames = new Map<string, number>();
    root.traverse(object => {
      if (object instanceof THREE.Light) { lights++; if (object.castShadow) shadowLights++; lightNames.push(object.name || object.parent?.name || object.type); }
      if (object instanceof THREE.Mesh) {
        meshCount++;
        const family = object.name.replace(/[-_]?\d+/g, '#');
        meshNames.set(family, (meshNames.get(family) ?? 0) + 1);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    console.info('[Warehouse frame sample]', JSON.stringify({ view, samples: this.intervals.length,
      frameIntervalP50Ms: percentile(this.intervals, 0.5), frameIntervalP95Ms: percentile(this.intervals, 0.95),
      updateCpuP95Ms: percentile(this.updates, 0.95),
      observedDrawSubmissionsP50: percentile(this.draws, 0.5), observedDrawSubmissionsP95: percentile(this.draws, 0.95),
      materialInstances: materials.size, lights, shadowLights, meshCount,
      lightNames, largestMeshFamilies: [...meshNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      note: 'Draw counts include all prior-frame render passes (engine resets each renderFrame). Frame intervals include scheduling, not GPU timing.' }));
    this.intervals = []; this.updates = []; this.draws = [];
  }
}
