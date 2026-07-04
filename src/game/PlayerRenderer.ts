import Phaser from 'phaser';
import { assetManifest, resolveCharacterFrame } from '../assets/manifest';
import type { PlayerState } from '../player/types';

const PLAYER_SCALE = 2.65;

interface PlayerView {
  container: Phaser.GameObjects.Container;
  dust: Phaser.GameObjects.Graphics;
  shadow: Phaser.GameObjects.Graphics;
  character: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
  lastDepth: number;
  lastName: string;
  lastCharacterKey: string;
}

export class PlayerRenderer {
  private view?: PlayerView;

  constructor(private readonly scene: Phaser.Scene) {}

  render(player: PlayerState, elapsedMs: number): void {
    const view = this.view ?? this.createView(player);
    const depth = player.position.y + 36;
    if (view.lastX !== player.position.x || view.lastY !== player.position.y) {
      view.container.setPosition(player.position.x, player.position.y);
      view.lastX = player.position.x;
      view.lastY = player.position.y;
    }
    if (view.lastDepth !== depth) {
      view.container.setDepth(depth);
      view.lastDepth = depth;
    }

    const name = player.profile.name || 'Player';
    if (view.lastName !== name) {
      view.nameText.setText(name);
      view.lastName = name;
    }

    const animationFrame = player.isMoving ? Math.floor(elapsedMs / 100) % 4 : 0;
    const frame = resolveCharacterFrame(player.profile.appearance.frame);
    const characterKey = `${frame}:${player.profile.appearance.tint ?? 'none'}:${player.facing}:${player.isMoving ? 1 : 0}:${animationFrame}`;
    if (view.lastCharacterKey !== characterKey) {
      this.updateFrame(view, player, animationFrame);
      view.lastCharacterKey = characterKey;
    }
  }

  private createView(player: PlayerState): PlayerView {
    const container = this.scene.add.container(player.position.x, player.position.y);
    const dust = this.scene.add.graphics();
    const shadow = this.scene.add.graphics();
    const character = this.scene.add.sprite(0, 0, assetManifest.characters.roguelikeSheet, resolveCharacterFrame(player.profile.appearance.frame));
    character.setScale(PLAYER_SCALE);
    character.setOrigin(0.5);

    const nameText = this.scene.add
      .text(0, -34, player.profile.name || 'Player', {
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        fontSize: '14px',
        color: '#0f263d',
        stroke: '#ffffff',
        strokeThickness: 3,
        backgroundColor: 'rgba(255,255,255,0.25)',
        padding: { left: 5, right: 5, top: 1, bottom: 1 },
      })
      .setResolution(Math.min(window.devicePixelRatio || 1, 2))
      .setOrigin(0.5);

    container.add([dust, shadow, character, nameText]);
    this.view = {
      container,
      dust,
      shadow,
      character,
      nameText,
      lastX: player.position.x,
      lastY: player.position.y,
      lastDepth: player.position.y + 36,
      lastName: player.profile.name || 'Player',
      lastCharacterKey: '',
    };
    this.drawShadow(shadow);
    this.updateFrame(this.view, player, 0);
    return this.view;
  }

  private updateFrame(view: PlayerView, player: PlayerState, frame: number): void {
    view.dust.clear();
    if (player.isMoving) {
      this.drawDust(view.dust, player.facing, frame);
    }

    const bob = player.isMoving ? [0, 2.1, 0, -2.1][frame % 4] : 0;
    view.character.setTexture(assetManifest.characters.roguelikeSheet);
    view.character.setFrame(resolveCharacterFrame(player.profile.appearance.frame));
    if (player.profile.appearance.tint) {
      view.character.setTint(player.profile.appearance.tint);
    } else {
      view.character.clearTint();
    }
    view.character.setAngle(0);
    view.character.setFlipX(player.facing === 'left');
    view.character.setY(bob);
    view.character.setScale(player.isMoving ? PLAYER_SCALE * 1.04 : PLAYER_SCALE);
  }

  private drawShadow(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    graphics.fillStyle(0x101828, 0.18);
    graphics.fillEllipse(0, 13, 22, 8);
  }

  private drawDust(graphics: Phaser.GameObjects.Graphics, facing: PlayerState['facing'], frame: number): void {
    const offsets = {
      left: [
        { x: 18, y: 15 },
        { x: 28, y: 20 },
        { x: 10, y: 23 },
      ],
      right: [
        { x: -18, y: 15 },
        { x: -28, y: 20 },
        { x: -10, y: 23 },
      ],
      up: [
        { x: -11, y: 30 },
        { x: 3, y: 33 },
        { x: 15, y: 29 },
      ],
      down: [
        { x: -12, y: 10 },
        { x: 3, y: 8 },
        { x: 15, y: 11 },
      ],
    } satisfies Record<PlayerState['facing'], Array<{ x: number; y: number }>>;

    offsets[facing].forEach((puff, index) => {
      const age = (frame + index) % 5;
      graphics.fillStyle(0x8b8f97, Math.max(0.06, 0.28 - age * 0.045));
      graphics.fillCircle(puff.x, puff.y, 3 + age * 1.1);
    });
  }
}
