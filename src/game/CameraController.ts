import Phaser from 'phaser';
import type { Vector2 } from '../data/locations';

const MAX_ZOOM_BASE = 3;
const INITIAL_ZOOM_TARGET = 1.18;
const ZOOM_FACTOR = 1.12;
const CLICK_DRAG_THRESHOLD = 5;
const FOLLOW_SUSPEND_MS = 1400;

export class CameraController {
  private pointerDown = false;
  private didDrag = false;
  private downPoint: Vector2 = { x: 0, y: 0 };
  private downScroll: Vector2 = { x: 0, y: 0 };
  private minZoom = 0.6;
  private maxZoom = MAX_ZOOM_BASE;
  private followSuspendedUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldSize: { width: number; height: number },
  ) {}

  install(): void {
    const camera = this.scene.cameras.main;
    camera.setBounds(0, 0, this.worldSize.width, this.worldSize.height);
    this.recalculateZoomBounds();
    camera.setZoom(Phaser.Math.Clamp(INITIAL_ZOOM_TARGET, this.minZoom, this.maxZoom));
    this.clampCamera();

    this.scene.input.on('pointerdown', this.handlePointerDown);
    this.scene.input.on('pointermove', this.handlePointerMove);
    this.scene.input.on('pointerup', this.handlePointerUp);
    this.scene.input.on('pointerupoutside', this.handlePointerUp);
    this.scene.input.on('gameout', this.handleGameOut);
    this.scene.input.on('wheel', this.handleWheel);
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy);
    window.addEventListener('blur', this.handleWindowBlur);
    this.scene.game.canvas.addEventListener('contextmenu', this.preventContextMenu);
  }

  destroy = (): void => {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('pointerupoutside', this.handlePointerUp);
    this.scene.input.off('gameout', this.handleGameOut);
    this.scene.input.off('wheel', this.handleWheel);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.scene.game.canvas.removeEventListener('contextmenu', this.preventContextMenu);
  };

  isClick(pointer: Phaser.Input.Pointer): boolean {
    const dx = pointer.x - this.downPoint.x;
    const dy = pointer.y - this.downPoint.y;
    return !this.didDrag && Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD;
  }

  isDragging(): boolean {
    return this.pointerDown && this.didDrag;
  }

  followWorldPoint(target: Vector2, lerp = 0.18): void {
    if (this.pointerDown || performance.now() < this.followSuspendedUntil) {
      return;
    }

    const camera = this.scene.cameras.main;
    const visibleWidth = camera.width / camera.zoom;
    const visibleHeight = camera.height / camera.zoom;
    const targetScrollX = target.x - visibleWidth / 2;
    const targetScrollY = target.y - visibleHeight / 2;

    camera.setScroll(
      Phaser.Math.Linear(camera.scrollX, targetScrollX, lerp),
      Phaser.Math.Linear(camera.scrollY, targetScrollY, lerp),
    );
    this.clampCamera();
  }

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    this.downPoint = { x: pointer.x, y: pointer.y };
    this.didDrag = false;

    if (!this.isRightButton(pointer)) {
      return;
    }

    pointer.event?.preventDefault();
    this.pointerDown = true;
    this.downScroll = {
      x: this.scene.cameras.main.scrollX,
      y: this.scene.cameras.main.scrollY,
    };
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.pointerDown) {
      return;
    }

    if (!pointer.rightButtonDown()) {
      this.stopDrag(true);
      return;
    }

    const dx = pointer.x - this.downPoint.x;
    const dy = pointer.y - this.downPoint.y;
    if (!this.didDrag && Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD) {
      return;
    }

    this.didDrag = true;
    this.suspendFollow();
    const camera = this.scene.cameras.main;
    camera.setScroll(this.downScroll.x - dx / camera.zoom, this.downScroll.y - dy / camera.zoom);
    this.clampCamera();
  };

  private readonly handlePointerUp = (): void => {
    this.pointerDown = false;
    this.clampCamera();
  };

  private readonly handleGameOut = (): void => {
    this.stopDrag(true);
  };

  private readonly handleWindowBlur = (): void => {
    this.stopDrag(true);
  };

  private readonly handleResize = (): void => {
    this.recalculateZoomBounds();
    const camera = this.scene.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(camera.zoom, this.minZoom, this.maxZoom));
    this.clampCamera();
  };

  private readonly handleWheel = (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    pointer.event?.preventDefault();
    this.suspendFollow();

    const camera = this.scene.cameras.main;
    const worldBefore = camera.getWorldPoint(pointer.x, pointer.y);
    const zoomFactor = deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    const nextZoom = Phaser.Math.Clamp(camera.zoom * zoomFactor, this.minZoom, this.maxZoom);
    if (Math.abs(nextZoom - camera.zoom) < 0.001) {
      return;
    }

    camera.setZoom(nextZoom);
    const worldAfter = camera.getWorldPoint(pointer.x, pointer.y);
    camera.scrollX += worldBefore.x - worldAfter.x;
    camera.scrollY += worldBefore.y - worldAfter.y;
    this.clampCamera();
  };

  private stopDrag(markAsDragged: boolean): void {
    if (this.pointerDown && markAsDragged) {
      this.didDrag = true;
      this.suspendFollow();
    }

    this.pointerDown = false;
    this.clampCamera();
  }

  private recalculateZoomBounds(): void {
    const camera = this.scene.cameras.main;
    const minZoomX = camera.width / this.worldSize.width;
    const minZoomY = camera.height / this.worldSize.height;
    this.minZoom = Math.max(0.2, minZoomX, minZoomY);
    this.maxZoom = Math.max(MAX_ZOOM_BASE, this.minZoom);
  }

  private clampCamera(): void {
    const camera = this.scene.cameras.main;
    const visibleWidth = camera.width / camera.zoom;
    const visibleHeight = camera.height / camera.zoom;
    const maxScrollX = this.worldSize.width - visibleWidth;
    const maxScrollY = this.worldSize.height - visibleHeight;

    const scrollX = maxScrollX <= 0 ? maxScrollX / 2 : Phaser.Math.Clamp(camera.scrollX, 0, maxScrollX);
    const scrollY = maxScrollY <= 0 ? maxScrollY / 2 : Phaser.Math.Clamp(camera.scrollY, 0, maxScrollY);
    camera.setScroll(scrollX, scrollY);
  }

  private suspendFollow(): void {
    this.followSuspendedUntil = performance.now() + FOLLOW_SUSPEND_MS;
  }

  private readonly preventContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private isRightButton(pointer: Phaser.Input.Pointer): boolean {
    const event = pointer.event;
    if (event instanceof MouseEvent) {
      return event.button === 2;
    }

    return false;
  }
}
