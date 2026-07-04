import Phaser from 'phaser';
import type { Agent } from '../agents/types';
import { assetManifest, resolveCharacterFrame } from '../assets/manifest';
import { cellToWorld } from '../data/townGrid';

const CHARACTER_SCALE = 2.35;

interface AgentView {
  container: Phaser.GameObjects.Container;
  character: Phaser.GameObjects.Sprite;
  dust: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  actionText: Phaser.GameObjects.Text;
  bubbleText: Phaser.GameObjects.Text;
  emoteText: Phaser.GameObjects.Text;
  selectedRing: Phaser.GameObjects.Graphics;
  lastX: number;
  lastY: number;
  lastDepth: number;
  lastCharacterKey: string;
  lastName: string;
  lastAction: string;
  lastEmoteText: string;
  lastBubbleText: string;
  lastBubbleVisible: boolean;
  lastEmoteVisible: boolean;
  lastSelected: boolean;
  lastNameVisible: boolean;
  lastActionVisible: boolean;
}

export class AgentRenderer {
  private readonly views = new Map<string, AgentView>();
  private readonly pathLines: Phaser.GameObjects.Graphics;
  private lastPathSignature = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSelectAgent: (agentId: string, pointer: Phaser.Input.Pointer) => void,
  ) {
    this.pathLines = scene.add.graphics();
    this.pathLines.setDepth(18);
  }

  render(agents: Agent[], selectedAgentId?: string, elapsedMs = 0, showPath = true, cameraZoom = 1): void {
    for (const agent of agents) {
      const view = this.views.get(agent.id) ?? this.createView(agent);
      const depth = agent.position.y + 30;
      if (view.lastX !== agent.position.x || view.lastY !== agent.position.y) {
        view.container.setPosition(agent.position.x, agent.position.y);
        view.lastX = agent.position.x;
        view.lastY = agent.position.y;
      }
      if (view.lastDepth !== depth) {
        view.container.setDepth(depth);
        view.lastDepth = depth;
      }

      const animationFrame = agent.isMoving ? Math.floor(elapsedMs / 110) % 4 : 0;
      const frame = resolveCharacterFrame(agent.appearance.frame);
      const characterKey = `${frame}:${agent.appearance.tint ?? 'none'}:${agent.facing}:${agent.isMoving ? 1 : 0}:${animationFrame}`;
      if (view.lastCharacterKey !== characterKey) {
        view.lastCharacterKey = characterKey;
        this.updateCharacterFrame(view, agent, animationFrame);
      }

      this.setTextIfChanged(view.nameText, agent.name, 'lastName', view);
      this.setTextIfChanged(view.actionText, agent.currentAction, 'lastAction', view);

      const selected = agent.id === selectedAgentId;
      if (view.lastSelected !== selected) {
        view.selectedRing.setVisible(selected);
        view.lastSelected = selected;
      }

      this.updateTextVisibility(view, selected, cameraZoom);

      const bubbleActive = Boolean(agent.speechBubble && agent.speechBubble.expiresAtMs > elapsedMs);
      if (view.lastBubbleVisible !== bubbleActive) {
        view.bubbleText.setVisible(bubbleActive);
        view.lastBubbleVisible = bubbleActive;
      }
      if (agent.speechBubble && bubbleActive) {
        this.setTextIfChanged(view.bubbleText, agent.speechBubble.text, 'lastBubbleText', view);
      }

      const emoteVisible = Boolean(agent.emoteState && (agent.emoteState.expiresAtMs === undefined || agent.emoteState.expiresAtMs > elapsedMs));
      if (view.lastEmoteVisible !== emoteVisible) {
        view.emoteText.setVisible(emoteVisible);
        view.lastEmoteVisible = emoteVisible;
      }
      if (agent.emoteState && emoteVisible) {
        this.setTextIfChanged(view.emoteText, this.emoteGlyph(agent.emoteState.kind), 'lastEmoteText', view);
      }
    }

    this.renderSelectedPath(agents, selectedAgentId, showPath);
  }

  private renderSelectedPath(agents: Agent[], selectedAgentId: string | undefined, showPath: boolean): void {
    const selectedAgent = showPath ? agents.find((agent) => agent.id === selectedAgentId) : undefined;
    const signature = selectedAgent
      ? [
          selectedAgent.id,
          selectedAgent.pathIndex,
          Math.round(selectedAgent.position.x),
          Math.round(selectedAgent.position.y),
          selectedAgent.currentPath.map((cell) => `${cell.x},${cell.y}`).join('|'),
        ].join(':')
      : 'hidden';

    if (signature === this.lastPathSignature) {
      return;
    }

    this.lastPathSignature = signature;
    this.pathLines.clear();
    if (selectedAgent) {
      this.drawAgentPath(selectedAgent);
    }
  }

  private drawAgentPath(agent: Agent): void {
    const remainingPath = agent.currentPath.slice(Math.max(0, agent.pathIndex - 1));
    if (remainingPath.length < 2) {
      return;
    }

    this.pathLines.lineStyle(4, 0x135fa8, 0.78);
    this.pathLines.fillStyle(0x135fa8, 0.95);
    let previous = { ...agent.position };

    for (const cell of remainingPath) {
      const next = cellToWorld(cell);
      this.pathLines.lineBetween(previous.x, previous.y, next.x, next.y);
      this.pathLines.fillRect(next.x - 3, next.y - 3, 6, 6);
      previous = next;
    }
  }

  private createView(agent: Agent): AgentView {
    const container = this.scene.add.container(agent.position.x, agent.position.y);
    container.setDepth(20);
    container.setSize(92, 98);

    const hitZone = this.scene.add.zone(0, 0, 72, 84).setOrigin(0.5);
    hitZone.setInteractive({ useHandCursor: true });
    hitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onSelectAgent(agent.id, pointer));

    const selectedRing = this.scene.add.graphics();
    selectedRing.lineStyle(2, 0x111827, 0.9);
    selectedRing.strokeEllipse(0, 4, 34, 42);
    selectedRing.setVisible(false);

    const dust = this.scene.add.graphics();
    const character = this.scene.add.sprite(0, 0, assetManifest.characters.roguelikeSheet, resolveCharacterFrame(agent.appearance.frame));
    character.setScale(CHARACTER_SCALE);
    character.setOrigin(0.5);

    const textResolution = Math.min(window.devicePixelRatio || 1, 2);
    const nameText = this.scene.add
      .text(0, -34, agent.name, {
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        fontSize: '14px',
        color: '#172033',
        stroke: '#ffffff',
        strokeThickness: 3,
        backgroundColor: 'rgba(255,255,255,0.25)',
        padding: { left: 5, right: 5, top: 1, bottom: 1 },
      })
      .setResolution(textResolution)
      .setOrigin(0.5);

    const actionText = this.scene.add
      .text(0, 24, agent.currentAction, {
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        fontSize: '12px',
        color: '#172033',
        stroke: '#ffffff',
        strokeThickness: 2,
        backgroundColor: 'rgba(255,255,255,0.25)',
        padding: { left: 5, right: 5, top: 1, bottom: 1 },
        wordWrap: { width: 112, useAdvancedWrap: true },
        align: 'center',
      })
      .setResolution(textResolution)
      .setOrigin(0.5, 0);

    const emoteText = this.scene.add
      .text(22, -55, '', {
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        fontSize: '18px',
        color: '#172033',
        stroke: '#ffffff',
        strokeThickness: 4,
        backgroundColor: 'rgba(255,255,255,0.55)',
        padding: { left: 6, right: 6, top: 2, bottom: 2 },
      })
      .setResolution(textResolution)
      .setOrigin(0.5)
      .setVisible(false);

    const bubbleText = this.scene.add
      .text(0, -50, '', {
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        fontSize: '11px',
        color: '#101828',
        backgroundColor: 'rgba(255,255,255,0.86)',
        padding: { left: 7, right: 7, top: 4, bottom: 4 },
        wordWrap: { width: 128, useAdvancedWrap: true },
        align: 'center',
      })
      .setResolution(textResolution)
      .setOrigin(0.5, 1)
      .setVisible(false);

    container.add([hitZone, dust, selectedRing, character, nameText, actionText, bubbleText, emoteText]);

    const view = {
      container,
      character,
      dust,
      nameText,
      actionText,
      bubbleText,
      emoteText,
      selectedRing,
      lastX: agent.position.x,
      lastY: agent.position.y,
      lastDepth: 20,
      lastCharacterKey: '',
      lastName: agent.name,
      lastAction: agent.currentAction,
      lastEmoteText: '',
      lastBubbleText: '',
      lastBubbleVisible: false,
      lastEmoteVisible: false,
      lastSelected: false,
      lastNameVisible: true,
      lastActionVisible: true,
    };
    this.views.set(agent.id, view);
    this.updateCharacterFrame(view, agent, 0);
    return view;
  }

  private updateCharacterFrame(view: AgentView, agent: Agent, frame: number): void {
    view.dust.clear();
    if (agent.isMoving) {
      this.drawDustTrail(view.dust, agent.facing, frame);
    }

    const bob = agent.isMoving ? [0, 1.8, 0, -1.8][frame % 4] : 0;
    view.character.setTexture(assetManifest.characters.roguelikeSheet);
    view.character.setFrame(resolveCharacterFrame(agent.appearance.frame));
    if (agent.appearance.tint) {
      view.character.setTint(agent.appearance.tint);
    } else {
      view.character.clearTint();
    }
    view.character.setAngle(0);
    view.character.setFlipX(agent.facing === 'left');
    view.character.setY(bob);
    view.character.setScale(agent.isMoving ? CHARACTER_SCALE * 1.03 : CHARACTER_SCALE);
  }

  private setTextIfChanged<K extends 'lastName' | 'lastAction' | 'lastBubbleText' | 'lastEmoteText'>(
    text: Phaser.GameObjects.Text,
    value: string,
    cacheKey: K,
    view: AgentView,
  ): void {
    if (view[cacheKey] !== value) {
      text.setText(value);
      view[cacheKey] = value;
    }
  }

  private drawDustTrail(graphics: Phaser.GameObjects.Graphics, facing: Agent['facing'], frame: number): void {
    const offsets = {
      left: [
        { x: 20, y: 16 },
        { x: 29, y: 21 },
        { x: 12, y: 24 },
      ],
      right: [
        { x: -20, y: 16 },
        { x: -29, y: 21 },
        { x: -12, y: 24 },
      ],
      up: [
        { x: -12, y: 31 },
        { x: 4, y: 34 },
        { x: 17, y: 29 },
      ],
      down: [
        { x: -13, y: 12 },
        { x: 4, y: 9 },
        { x: 17, y: 14 },
      ],
    } satisfies Record<Agent['facing'], Array<{ x: number; y: number }>>;

    const puffs = offsets[facing];
    for (let index = 0; index < puffs.length; index += 1) {
      const puff = puffs[index];
      const age = (frame + index) % 4;
      const radius = 3 + age * 1.2;
      const alpha = Math.max(0.08, 0.26 - age * 0.045);
      graphics.fillStyle(0x8b8f97, alpha);
      graphics.fillCircle(puff.x, puff.y, radius);
    }
  }

  private updateTextVisibility(view: AgentView, selected: boolean, cameraZoom: number): void {
    const nameVisible = cameraZoom >= 0.55 || selected;
    const actionVisible = cameraZoom >= 0.95 || selected;

    if (view.lastNameVisible !== nameVisible) {
      view.nameText.setVisible(nameVisible);
      view.lastNameVisible = nameVisible;
    }
    if (view.lastActionVisible !== actionVisible) {
      view.actionText.setVisible(actionVisible);
      view.lastActionVisible = actionVisible;
    }
  }

  private emoteGlyph(kind: NonNullable<Agent['emoteState']>['kind']): string {
    const glyphs = {
      heart: '♥',
      message: '!',
      question: '?',
      angry: '!!',
      sad: ':(',
      surprise: '!',
      neutral: '...',
    } satisfies Record<NonNullable<Agent['emoteState']>['kind'], string>;
    return glyphs[kind];
  }
}
