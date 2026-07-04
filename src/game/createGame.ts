import Phaser from 'phaser';
import type { AgentSimulation } from '../agents/AgentSimulation';
import type { PerformanceMonitor } from '../performance/PerformanceMonitor';
import { TownScene } from './TownScene';

export function createGame(
  simulation: AgentSimulation,
  onSelectAgent: (agentId: string) => void,
  performanceMonitor?: PerformanceMonitor,
): Phaser.Game {
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  const config: Phaser.Types.Core.GameConfig & { resolution: number } = {
    type: Phaser.WEBGL,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#f6f3ea',
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    resolution: deviceScale,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [new TownScene(simulation, onSelectAgent, performanceMonitor)],
  };

  return new Phaser.Game(config);
}
