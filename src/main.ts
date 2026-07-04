import './styles.css';
import { TemplateDialogueProvider } from './ai/TemplateDialogueProvider';
import { AgentSimulation } from './agents/AgentSimulation';
import { createGame } from './game/createGame';
import { PerformanceMonitor } from './performance/PerformanceMonitor';
import { HudController } from './ui/HudController';

const simulation = new AgentSimulation(new TemplateDialogueProvider());
const performanceMonitor = new PerformanceMonitor();
const hud = new HudController(simulation, performanceMonitor);

createGame(simulation, (agentId) => {
  simulation.setSelectedAgent(agentId);
  hud.update(true);
}, performanceMonitor);

const HUD_REFRESH_INTERVAL_MS = 125;
let lastHudRefreshAt = 0;

function refreshHud(now = performance.now()): void {
  if (now - lastHudRefreshAt >= HUD_REFRESH_INTERVAL_MS) {
    hud.update(false);
    lastHudRefreshAt = now;
  }
  window.requestAnimationFrame(refreshHud);
}

hud.update(true);
window.requestAnimationFrame(refreshHud);
