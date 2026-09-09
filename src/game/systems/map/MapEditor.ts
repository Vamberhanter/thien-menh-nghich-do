import Phaser from 'phaser';
import { GameBus, GameEvent } from '../../events';
import type { EditorCommandPayload, EditorSelectionPayload, EditorStatePayload } from '../../events';
import { RENDER_SCALE } from '../../config/renderScale';
import { GROUND_FAMILIES, pickGroundTile, type GroundFamily } from './groundTiles';
import { addBlock, isTilemapZone, NGUHANHSON_TILE, type TilemapLayout, type TilemapProp } from './TilemapTerrain';
import type { MapManager } from './MapManager';
import { ZONES, type ChestDef, type ChestTier, type MobKind, type MobSpawn, type PortalDef, type ZoneDef, type ZoneId } from '../../zones';
import { loadMapDraft, saveMapDraft } from '../../../net/mapDraftStore';

/**
 * A drag-and-drop level editor over the live tilemap.
 *
 * It edits the map that is already loaded and playing, not a separate
 * document: the 199 props `nguHanhSon.ts` already placed are the *same*
 * sprites this selects, drags and deletes — nothing is copied — ground
 * painting writes straight into the same `TilemapLayer`s the renderer already
 * draws, and gameplay markers are plain circles with a data bag — there is no
 * live mob/chest/portal spawned by placing one, only the record `exportCode`
 * turns into the same shape `ZoneDef` already expects.
 *
 * `activate()` imports every prop the active terrain reports through
 * `MapManager.editableProps` — see `TilemapTerrain`'s `EditableProp` — the
 * first time it runs for a given zone, and only then: switching the editor
 * off and back on inside the same session keeps whatever was added, moved or
 * deleted rather than re-importing over it.
 */

type ArmedTool =
  | { kind: 'prop'; texture: string; frame: string; solid?: { width: number; height: number } }
  | { kind: 'ground'; family: GroundFamily | 'erase-road' }
  | { kind: 'mob' }
  | { kind: 'chest' }
  | { kind: 'portal' }
  | { kind: 'trigger' }
  | null;

interface PlacedProp {
  readonly kind: 'prop';
  readonly id: number;
  /** Whether this came from the zone's own data or was added this session. */
  readonly origin: 'baked' | 'added';
  readonly texture: string;
  readonly frame: string;
  /** Collision footprint at `scale` 1 — the actual box in play is this times `scale`. */
  readonly solid?: { readonly width: number; readonly height: number };
  /** The full original spec, for a baked prop — keeps `tint`/`depth`/`unlit`/… alive through export even though this editor never reads them. */
  readonly sourceDef?: TilemapProp;
  readonly body?: Phaser.Physics.Arcade.Sprite;
  x: number;
  y: number;
  /** The sprite's own display size the moment it entered `placed`, before any resizing here — `scale` multiplies this, never the size from the previous edit, so dragging the slider back to 100% always lands on exactly what it started at. */
  readonly baseWidth: number;
  readonly baseHeight: number;
  scale: number;
  readonly node: Phaser.GameObjects.Image;
}

interface PlacedMarker {
  readonly kind: 'mob' | 'chest' | 'portal' | 'trigger';
  readonly id: number;
  x: number;
  y: number;
  data: Record<string, string | number>;
  readonly node: Phaser.GameObjects.Container;
}

type Placed = PlacedProp | PlacedMarker;

/** The one trigger shape this editor supports — see `defaultData` and `exportCode`. */
interface DraftTrigger {
  id: string;
  shape: { kind: 'circle'; x: number; y: number; radius: number };
  event: string;
  data: { text: string };
}

/**
 * Everything needed to rebuild a map exactly — `save()` writes this to
 * Supabase, `open()`/`autoRestore()` read it back, and a blank `newMap()` is
 * just this shape with empty layers. Deliberately flat JSON, not a `ZoneDef`
 * itself: the fields a `ZoneDef` needs but this editor never touches (shrine,
 * waypoint, farm…) don't belong in a payload only this class ever reads.
 */
interface MapDraft {
  id: string;
  name: string;
  ambient?: number;
  cols: number;
  rows: number;
  ground: number[];
  overlay: number[];
  blocked: boolean[];
  props: TilemapProp[];
  mobs: MobSpawn[];
  chests: ChestDef[];
  portals: PortalDef[];
  triggers: DraftTrigger[];
}

/** Marker fill by kind, and the radius/label drawn for each. */
const MARKER_STYLE: Record<PlacedMarker['kind'], { color: number; label: string }> = {
  mob: { color: 0xe0473c, label: 'QUÁI' },
  chest: { color: 0xd8b23a, label: 'RƯƠNG' },
  portal: { color: 0x9a5ce0, label: 'CỔNG' },
  trigger: { color: 0x3ac8d8, label: 'VÙNG' },
};

const MARKER_RADIUS = 10;
/** How close a click has to land on a marker's dot to select it, in world px. */
const MARKER_PICK_RADIUS = 24;
/** How far a held right button has to move, in backing px, before it means "pan" instead of "click". */
const RIGHT_DRAG_THRESHOLD = 10;
const EDITOR_DEPTH = 9000;

export class MapEditor {
  active = false;

  private tool: ArmedTool = null;
  private nextId = 1;
  private placed = new Map<number, Placed>();
  private selectedId: number | null = null;
  private painting = false;
  private ghost?: Phaser.GameObjects.Image;
  private selectionRing?: Phaser.GameObjects.Arc;
  private dragOffset: { x: number; y: number } | null = null;
  /** Where a middle- or right-mouse pan started, and the camera's own scroll at that instant. */
  private panFrom: { screenX: number; screenY: number; scrollX: number; scrollY: number; button: 'middle' | 'right' } | null = null;
  /** Whether a held right button has moved past the drag threshold yet — see `onPointerMove`. */
  private rightDragged = false;
  /** The item a right-click opened a delete menu for, if any, and where. */
  private contextMenuId: number | null = null;
  private contextMenuScreen: { x: number; y: number } | null = null;
  /** Which zone `placed` currently holds the baked props of — see `syncBakedProps`. */
  private importedZoneId: string | null = null;
  /** Row-major cell indices whose original collision body has been painted over. */
  private unblockedCells = new Set<number>();
  /** True once `newMap`/`open` has swapped in a map that isn't the player's real, registered zone — see `exportCode`. */
  private isDraftMode = false;
  /** The zone id `autoRestore` has already attempted a fetch for, this scene visit — never twice, or a later save could get clobbered by an older one re-fetched on a stray F2 toggle. */
  private restoredZoneId: string | null = null;
  /** Bumped on every zone swap so a slow, now-stale `autoRestore` fetch knows to drop its result instead of applying it late. */
  private restoreToken = 0;
  private busy = false;
  private noticeText: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly maps: MapManager,
  ) {
    GameBus.on(GameEvent.EditorCommand, this.onCommand, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      GameBus.off(GameEvent.EditorCommand, this.onCommand, this);
      this.teardown();
    });
  }

  toggle(): void {
    this.active ? this.deactivate() : this.activate();
  }

  private activate(): void {
    const zoneId = this.maps.map.id;
    const freshZone = this.importedZoneId !== zoneId;
    this.syncBakedProps();
    this.active = true;
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    // The browser's own right-click menu would otherwise show over the
    // canvas — Phaser reports the right button through `pointerdown` fine,
    // but nothing in Phaser stops the OS-level menu from also appearing.
    this.scene.game.canvas.addEventListener('contextmenu', this.onContextMenu);
    // Same idea for the middle button: left alone, most browsers drop into
    // their own native auto-scroll mode (the little scroll-icon cursor) the
    // instant it goes down, which fights the drag-to-pan below it stride for
    // stride.
    this.scene.game.canvas.addEventListener('mousedown', this.onMouseDown);
    this.emitState();
    // Only on a genuinely new zone visit — an F2 off/on toggle on the map
    // already open here must never re-fetch and silently overwrite edits
    // made since the last save.
    if (freshZone && this.restoredZoneId !== zoneId) {
      this.restoredZoneId = zoneId;
      void this.autoRestore(zoneId);
    }
  }

  private deactivate(): void {
    this.active = false;
    this.tool = null;
    this.painting = false;
    this.panFrom = null;
    this.rightDragged = false;
    this.ghost?.destroy();
    this.ghost = undefined;
    this.closeContextMenu();
    this.restoreToken++;
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.game.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.scene.game.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.emitState();
  }

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (event.button === 1) event.preventDefault();
  };

  private teardown(): void {
    for (const item of this.placed.values()) item.node.destroy();
    this.placed.clear();
    this.ghost?.destroy();
    this.selectionRing?.destroy();
  }

  /**
   * Pulls the active terrain's own props into `placed`, once per zone.
   *
   * Skipped when `importedZoneId` already matches — toggling the editor off
   * and back on must not throw away a drag or a delete that happened five
   * seconds ago. It only re-imports on an actual zone change, and when it
   * does, the old entries are dropped first: they point at sprites a portal
   * crossing has already destroyed.
   */
  private syncBakedProps(): void {
    const zoneId = this.maps.map.id;
    if (this.importedZoneId === zoneId) return;

    for (const item of this.placed.values()) item.node.destroy();
    this.placed.clear();
    this.select(null);
    this.unblockedCells.clear();

    for (const editable of this.maps.editableProps ?? []) {
      const id = this.nextId++;
      this.placed.set(id, {
        kind: 'prop',
        id,
        origin: 'baked',
        texture: editable.def.texture,
        frame: editable.def.frame,
        solid: editable.def.solid,
        sourceDef: editable.def,
        body: editable.body,
        x: editable.sprite.x,
        y: editable.sprite.y,
        baseWidth: editable.sprite.displayWidth,
        baseHeight: editable.sprite.displayHeight,
        scale: 1,
        node: editable.sprite,
      });
    }
    this.importedZoneId = zoneId;
  }

  /** `WorldScene.tickKeys` calls this for Delete/Backspace/Escape. */
  handleKey(key: 'delete' | 'escape'): void {
    if (!this.active) return;
    if (key === 'delete') this.deleteSelected();
    else this.disarm();
  }

  private onCommand(cmd: EditorCommandPayload): void {
    if (!this.active && cmd.action !== 'close') return;
    switch (cmd.action) {
      case 'arm-prop':
        if (cmd.texture && cmd.frame) {
          this.tool = {
            kind: 'prop',
            texture: cmd.texture,
            frame: cmd.frame,
            solid: cmd.solidW && cmd.solidH ? { width: cmd.solidW, height: cmd.solidH } : undefined,
          };
        }
        break;
      case 'arm-ground':
        if (cmd.ground) this.tool = { kind: 'ground', family: cmd.ground };
        break;
      case 'arm-mob':
        this.tool = { kind: 'mob' };
        break;
      case 'arm-chest':
        this.tool = { kind: 'chest' };
        break;
      case 'arm-portal':
        this.tool = { kind: 'portal' };
        break;
      case 'arm-trigger':
        this.tool = { kind: 'trigger' };
        break;
      case 'disarm':
        this.disarm();
        break;
      case 'delete-selected':
        this.deleteSelected();
        break;
      case 'clear':
        this.clearAdded();
        break;
      case 'clear-all':
        this.clearEverything();
        break;
      case 'update-selected':
        this.updateSelected(cmd.field, cmd.value);
        break;
      case 'export':
        this.emitState(this.exportCode());
        return;
      case 'close':
        if (this.active) this.deactivate();
        return;
      case 'new-map':
        if (cmd.mapName && cmd.mapCols && cmd.mapRows) this.newMap(cmd.mapName, cmd.mapCols, cmd.mapRows);
        break;
      case 'save-map':
        void this.save();
        return; // async — emits its own state when it settles
      case 'open-map':
        if (cmd.mapId) void this.open(cmd.mapId);
        return; // async — emits its own state when it settles
    }
    this.emitState();
  }

  private disarm(): void {
    this.tool = null;
    this.ghost?.destroy();
    this.ghost = undefined;
    this.closeContextMenu();
    // Every caller needs React to learn the tool/menu cleared — `handleKey`'s
    // Escape path calls this directly, outside `onCommand`'s shared emit at
    // the bottom of its switch, and without this the "đang cầm" label and any
    // open delete menu stayed stuck on screen until some unrelated command
    // happened to emit next.
    this.emitState();
  }

  private closeContextMenu(): void {
    this.contextMenuId = null;
    this.contextMenuScreen = null;
  }

  /* ------------------------------------------------------------- pointer */

  private worldPoint(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const p = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: p.x, y: p.y };
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active) return;

    if (this.panFrom) {
      const dx = pointer.x - this.panFrom.screenX;
      const dy = pointer.y - this.panFrom.screenY;
      // A held right button stays a plain click — still free to pick/open the
      // delete menu on release — until it has actually moved; only past the
      // threshold does it commit to meaning "pan" for the rest of this hold.
      if (this.panFrom.button === 'right' && !this.rightDragged) {
        if (Math.hypot(dx, dy) < RIGHT_DRAG_THRESHOLD) return;
        this.rightDragged = true;
        this.closeContextMenu();
      }
      const cam = this.scene.cameras.main;
      // Screen-pixel drag distance divided by zoom, not subtracted straight
      // from `worldPoint` each frame — the two `getWorldPoint` calls that
      // would need (before and after scrolling) disagree by exactly the
      // scroll itself, so the naive version can never actually catch up to
      // the cursor. This scales the raw drag once, off the scroll recorded
      // when the pan button first went down.
      cam.scrollX = this.panFrom.scrollX - dx / cam.zoom;
      cam.scrollY = this.panFrom.scrollY - dy / cam.zoom;
      return;
    }

    const { x, y } = this.worldPoint(pointer);

    if (this.dragOffset && this.selectedId !== null) {
      const item = this.placed.get(this.selectedId);
      if (item) this.moveTo(item, x - this.dragOffset.x, y - this.dragOffset.y);
      return;
    }

    if (this.tool?.kind === 'ground') {
      if (this.painting && pointer.isDown) this.paintGroundAt(x, y);
      return;
    }

    if (this.tool?.kind === 'prop') this.updateGhost(x, y);
  }

  /**
   * True only when the click actually landed on the game canvas.
   *
   * Phaser's input plugin listens on the window, not the canvas element, so
   * a click on the React palette sitting on top of it — a DOM sibling with a
   * higher `z-index`, not a child of the canvas — still reaches this handler.
   * Measured: clicking "Anh đào" in the palette both armed the cherry-tree
   * tool (React's own `onClick`) *and* fired this as a placement/selection
   * click, on whatever world point happened to sit under the button, in the
   * same frame. `pointer.event.target` is the actual DOM element the browser
   * dispatched to, and it is the canvas only when nothing else was in front
   * of it.
   */
  private fromCanvas(pointer: Phaser.Input.Pointer): boolean {
    const target = (pointer.event as Event | undefined)?.target;
    return target === this.scene.game.canvas;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.active || !this.fromCanvas(pointer)) return;

    // Middle-drag always pans, free of whatever tool is armed or what's
    // under the cursor — left-click already means place/select, so the
    // camera needed a button of its own rather than overloading it.
    if (pointer.middleButtonDown()) {
      const cam = this.scene.cameras.main;
      this.panFrom = { screenX: pointer.x, screenY: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY, button: 'middle' };
      return;
    }

    /*
     * A right press could still turn into either — "pick this, offer to
     * delete it" if it lifts without moving, "pan the camera" if it doesn't
     * — so nothing is decided here. `onPointerMove` promotes it to a pan
     * past `RIGHT_DRAG_THRESHOLD`; `onPointerUp` runs the pick/menu logic
     * itself only when that never happened.
     */
    if (pointer.rightButtonDown()) {
      const cam = this.scene.cameras.main;
      this.panFrom = { screenX: pointer.x, screenY: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY, button: 'right' };
      this.rightDragged = false;
      return;
    }

    const { x, y } = this.worldPoint(pointer);

    // Any left click on the canvas closes an open delete menu — it is not
    // pinned to the thing it was opened for once the player has clearly
    // moved on to something else.
    this.closeContextMenu();

    if (this.tool?.kind === 'ground') {
      this.painting = true;
      this.paintGroundAt(x, y);
      return;
    }
    if (this.tool) {
      this.placeFromTool(x, y);
      // Prop tools stay armed after placing — this is the only place that
      // would otherwise tell React the count went up while still holding it.
      this.emitState();
      return;
    }

    const hit = this.pick(x, y);
    this.select(hit?.id ?? null);
    if (hit) this.dragOffset = { x: x - hit.x, y: y - hit.y };
    // `select()` only moves the ring sprite — without this the React
    // inspector would not learn a selection happened until some *other*
    // command's `emitState()` incidentally fired one.
    this.emitState();
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    // A drag that moved the selection never called `emitState` mid-flight
    // (every frame would be wasteful) — this is where the inspector's shown
    // (x, y) catches up to wherever the drag actually ended.
    if (this.dragOffset) this.emitState();
    this.painting = false;
    this.dragOffset = null;

    // A right button that lifted without ever crossing the drag threshold
    // was a plain click all along — this is the one place left to run the
    // pick/menu it was always going to do.
    if (this.panFrom?.button === 'right' && !this.rightDragged) {
      const { x, y } = this.worldPoint(pointer);
      const hit = this.pick(x, y);
      this.select(hit?.id ?? null);
      this.contextMenuId = hit?.id ?? null;
      // CSS pixels, not the canvas's backing-store pixels — `ResponsiveCanvas`
      // draws at `RENDER_SCALE` device pixels per CSS one, and the canvas
      // sits flush at the viewport's own (0, 0), so dividing this back out is
      // the whole conversion the floating button needs to place itself.
      this.contextMenuScreen = hit ? { x: pointer.x / RENDER_SCALE, y: pointer.y / RENDER_SCALE } : null;
      this.emitState();
    }
    this.panFrom = null;
    this.rightDragged = false;
  }

  /**
   * Hit-tests a world point against every placed thing.
   *
   * A prop is picked by its actual on-screen box — origin (0.5, 1), so the
   * box sits centred on `x` and rises from `y` — rather than a fixed radius
   * from that anchor point: a fixed radius let a big tree's canopy go
   * unclickable near its edges while a tiny prop's box was mostly dead space
   * around it, and that mismatch was the actual reason "chọn được lúc được
   * lúc không" kept recurring even after right-click started hit-testing
   * reliably. A marker has no art to bound, so it keeps the old radius
   * check against its dot.
   *
   * Several boxes can overlap — a bush under a tree's canopy — so among every
   * match this keeps the one with the greatest foot Y, the same rule the
   * renderer itself sorts depth by, since that is whichever one is actually
   * drawn on top at that point.
   */
  private pick(x: number, y: number): Placed | null {
    let best: Placed | null = null;
    let bestY = -Infinity;
    for (const item of this.placed.values()) {
      if (item.kind === 'prop') {
        const w = item.node.displayWidth;
        const h = item.node.displayHeight;
        if (x < item.x - w / 2 || x > item.x + w / 2 || y < item.y - h || y > item.y) continue;
      } else if (Phaser.Math.Distance.Between(x, y, item.x, item.y) > MARKER_PICK_RADIUS) {
        continue;
      }
      if (item.y > bestY) {
        best = item;
        bestY = item.y;
      }
    }
    return best;
  }

  /* --------------------------------------------------------------- place */

  private placeFromTool(x: number, y: number): void {
    const tool = this.tool;
    if (!tool) return;
    if (tool.kind === 'prop') {
      const node = this.scene.add.image(x, y, tool.texture, tool.frame).setOrigin(0.5, 1).setDepth(y);
      // A real collision body, the same call `TilemapTerrain` makes for every
      // solid prop it places — without this, something added here would
      // block nothing and a player could walk straight through it.
      const body = tool.solid
        ? addBlock(this.maps.solids, x, y - tool.solid.height / 2, tool.solid.width, tool.solid.height)
        : undefined;
      const id = this.nextId++;
      this.placed.set(id, {
        kind: 'prop',
        id,
        origin: 'added',
        texture: tool.texture,
        frame: tool.frame,
        solid: tool.solid,
        body,
        x,
        y,
        baseWidth: node.displayWidth,
        baseHeight: node.displayHeight,
        scale: 1,
        node,
      });
      // Props stay armed — placing a forest is one click each, not one arm each.
      return;
    }

    // Ground is painted, not stamped — `onPointerDown` never reaches here
    // with it armed, but the type has to be narrowed for TS too.
    if (tool.kind === 'ground') return;
    const marker = this.createMarker(tool.kind, x, y, defaultData(tool.kind, x, y));
    this.select(marker.id);
    // Gameplay markers auto-disarm: each one usually needs its own tuning in
    // the inspector right after, and placing five before noticing none of
    // them are configured is worse than one extra click per marker.
    this.disarm();
  }

  /** The visual side of a marker — shared by placing one by hand and rebuilding one from a saved draft. */
  private createMarker(kind: PlacedMarker['kind'], x: number, y: number, data: Record<string, string | number>): PlacedMarker {
    const style = MARKER_STYLE[kind];
    const node = this.scene.add.container(x, y).setDepth(EDITOR_DEPTH);
    const dot = this.scene.add.circle(0, 0, MARKER_RADIUS, style.color, 0.85).setStrokeStyle(2, 0xffffff, 0.8);
    const label = this.scene.add
      .text(0, -MARKER_RADIUS - 4, style.label, { fontFamily: 'monospace', fontSize: '11px', color: '#fff' })
      .setOrigin(0.5, 1)
      .setStroke('#000', 3);
    node.add([dot, label]);
    const id = this.nextId++;
    const marker: PlacedMarker = { kind, id, x, y, data, node };
    this.placed.set(id, marker);
    return marker;
  }

  private paintGroundAt(x: number, y: number): void {
    const layers = this.maps.tileLayers;
    if (!layers || this.tool?.kind !== 'ground') return;
    const col = Math.floor(x / layers.tileSize);
    const row = Math.floor(y / layers.tileSize);
    if (col < 0 || row < 0 || col >= layers.cols || row >= layers.rows) return;

    if (this.tool.family === 'erase-road') {
      layers.overlay.removeTileAt(col, row);
      return;
    }
    const family = GROUND_FAMILIES[this.tool.family];
    const index = pickGroundTile(family, col, row);
    if (this.tool.family === 'road') {
      layers.overlay.putTileAt(index, col, row);
    } else {
      layers.ground.putTileAt(index, col, row);
      layers.overlay.removeTileAt(col, row);
    }

    /*
     * Walkable ground now sits on this cell — take its collision body back
     * out if it had one, so `blocked[]` and the floor stop disagreeing.
     *
     * Every blocked cell got exactly one body when the map was built (see
     * `TilemapTerrain`), keyed by the same "col,row" this looks up, so there
     * is at most one to remove. `blockedBodies` is not mutated — a second
     * paint on the same cell finds the same, already-destroyed sprite and
     * `destroy()` on an already-destroyed `GameObject` is a no-op — so the
     * lookup does not need a "have I handled this one" guard of its own.
     */
    const idx = row * layers.cols + col;
    const body = this.maps.blockedBodies?.get(`${col},${row}`);
    if (body) {
      body.destroy();
      this.unblockedCells.add(idx);
    }
  }

  private updateGhost(x: number, y: number): void {
    if (this.tool?.kind !== 'prop') return;
    const { texture, frame } = this.tool;
    if (!this.ghost) {
      this.ghost = this.scene.add.image(x, y, texture, frame).setOrigin(0.5, 1).setAlpha(0.55).setDepth(EDITOR_DEPTH + 1);
    }
    if (this.ghost.texture.key !== texture || this.ghost.frame.name !== frame) {
      this.ghost.setTexture(texture, frame);
    }
    this.ghost.setPosition(x, y);
  }

  /* ---------------------------------------------------------- selection */

  /** A ring sized to what is actually selected, not one fixed radius for everything. */
  private ringGeometry(item: Placed): { y: number; radius: number } {
    if (item.kind === 'prop') {
      const w = item.node.displayWidth;
      const h = item.node.displayHeight;
      return { y: item.y - h / 2, radius: Math.max(w, h) / 2 };
    }
    return { y: item.y, radius: MARKER_RADIUS + 4 };
  }

  private select(id: number | null): void {
    this.selectedId = id;
    this.selectionRing?.destroy();
    this.selectionRing = undefined;
    const item = id !== null ? this.placed.get(id) : undefined;
    if (item) {
      const { y, radius } = this.ringGeometry(item);
      this.selectionRing = this.scene.add
        .circle(item.x, y, radius)
        .setStrokeStyle(2, 0xffe066, 0.9)
        .setDepth(EDITOR_DEPTH + 2);
    }
  }

  /** Solid box scaled to a prop's current `scale` — the box the physics body should actually have right now. */
  private scaledSolid(item: PlacedProp): { width: number; height: number } | undefined {
    if (!item.solid) return undefined;
    return { width: item.solid.width * item.scale, height: item.solid.height * item.scale };
  }

  private moveTo(item: Placed, x: number, y: number): void {
    item.x = x;
    item.y = y;
    item.node.setPosition(x, y);
    if (item.kind === 'prop') {
      item.node.setDepth(y);
      // The collision box has to follow — it is centred on its own point
      // above the foot, not on (x, y) itself, so it is recomputed rather
      // than just re-set to the new position.
      const solid = this.scaledSolid(item);
      if (item.body && solid) {
        const body = item.body.body as Phaser.Physics.Arcade.StaticBody;
        const cx = x;
        const cy = y - solid.height / 2;
        item.body.setPosition(cx, cy);
        body.position.set(cx - solid.width / 2, cy - solid.height / 2);
        body.updateCenter();
      }
    }
    const { y: ringY } = this.ringGeometry(item);
    this.selectionRing?.setPosition(x, ringY);
  }

  private deleteSelected(): void {
    if (this.selectedId === null) return;
    const item = this.placed.get(this.selectedId);
    if (!item) return;
    if (item.kind === 'prop') item.body?.destroy();
    item.node.destroy();
    this.placed.delete(this.selectedId);
    this.select(null);
    this.closeContextMenu();
    this.emitState();
  }

  /**
   * Removes everything placed *this session* — markers, and props whose
   * `origin` is `'added'`. A baked prop stays exactly where it is.
   *
   * The first version of this cleared `placed` outright, which reads as "my
   * test placements" but actually means "every prop the zone has, gone" —
   * `syncBakedProps` had put the map's own 198 props in the same map this
   * iterates, so one confirm dialog deleted the entire scene. Measured
   * first-hand: a "clean up" pass through this left the island bare — this
   * is now the safe default, and `clearEverything` below is the one that
   * still does what the old `clearAll` did, as something asked for on
   * purpose rather than reached by accident.
   */
  private clearAdded(): void {
    for (const [id, item] of this.placed) {
      if (item.kind === 'prop' && item.origin === 'baked') continue;
      if (item.kind === 'prop') item.body?.destroy();
      item.node.destroy();
      this.placed.delete(id);
    }
    this.select(null);
    this.emitState();
  }

  /**
   * Removes every prop and marker, the map's own baked scenery included.
   *
   * Only a preview until `exportCode` runs and the result is pasted back —
   * this never touches `nguHanhSon.ts`, only the live scene. Reloading the
   * page, or leaving through a portal and coming back, re-imports the
   * original 198 fresh (`syncBakedProps` only skips the import when
   * `importedZoneId` already matches, and neither of those resets it);
   * toggling the editor off and back on inside the same visit does not —
   * that would make "cleared" mean something different depending on
   * whether F2 happened to get pressed twice.
   */
  private clearEverything(): void {
    for (const [id, item] of this.placed) {
      if (item.kind === 'prop') item.body?.destroy();
      item.node.destroy();
      this.placed.delete(id);
    }
    this.select(null);
    this.emitState();
  }

  private updateSelected(field: string | undefined, value: string | number | undefined): void {
    if (!field || this.selectedId === null) return;
    const item = this.placed.get(this.selectedId);
    if (!item) return;
    if (item.kind === 'prop') {
      if (field === 'scale') this.setPropScale(item, Number(value) || 1);
      return;
    }
    item.data = { ...item.data, [field]: value ?? '' };
  }

  /** Resizes a prop's sprite (and its collision box, proportionally) around `baseWidth`/`baseHeight`. */
  private setPropScale(item: PlacedProp, scale: number): void {
    item.scale = Phaser.Math.Clamp(scale, 0.1, 5);
    item.node.setDisplaySize(item.baseWidth * item.scale, item.baseHeight * item.scale);
    const solid = this.scaledSolid(item);
    if (item.body && solid) {
      const body = item.body.body as Phaser.Physics.Arcade.StaticBody;
      const cx = item.x;
      const cy = item.y - solid.height / 2;
      body.setSize(solid.width, solid.height);
      item.body.setPosition(cx, cy);
      body.position.set(cx - solid.width / 2, cy - solid.height / 2);
      body.updateCenter();
    }
    if (this.selectedId === item.id) {
      const { y, radius } = this.ringGeometry(item);
      this.selectionRing?.setPosition(item.x, y);
      this.selectionRing?.setRadius(radius);
    }
  }

  /* ---------------------------------------------------------------- map */

  /**
   * Blank canvas: an all-grass, prop-free tilemap of the given size, swapped
   * in the same way `clearEverything` already only ever touches the running
   * preview — nothing about it is saved, or reachable by any player, until
   * `save()` writes it to Supabase and `Xuất code` turns it into a file this
   * developer pastes in and registers as a real `ZoneId`.
   */
  newMap(name: string, cols: number, rows: number): void {
    const id = slugify(name) || `map-moi-${Date.now()}`;
    const size = Math.max(1, cols) * Math.max(1, rows);
    const ground = Array.from({ length: size }, (_, i) =>
      pickGroundTile(GROUND_FAMILIES.grass, i % cols, Math.floor(i / cols)),
    );
    const draft: MapDraft = {
      id,
      name,
      ambient: 0xffffff,
      cols,
      rows,
      ground,
      overlay: new Array(size).fill(-1),
      blocked: new Array(size).fill(false),
      props: [],
      mobs: [],
      chests: [],
      portals: [],
      triggers: [],
    };
    this.applyDraft(draft);
    this.notice(`Đã tạo map mới "${name}" (${cols}x${rows} ô) — nhớ bấm "Lưu map" để không mất khi tải lại trang.`);
  }

  /** Writes the current map's full state to Supabase, keyed by its own id. */
  private async save(): Promise<void> {
    const draft = this.serializeDraft();
    if (draft.cols === 0 || draft.rows === 0) {
      this.notice('Map hiện tại không phải dạng lưới ô (tilemap) — chỉ Ngũ Hành Sơn hoặc map tự tạo mới lưu được.');
      return;
    }
    this.setBusy(true, `Đang lưu "${draft.name}"...`);
    await saveMapDraft(draft.id, draft);
    this.setBusy(false, `Đã lưu map "${draft.name}" (id: "${draft.id}"). Mở lại bằng đúng id này.`);
  }

  /** Loads a previously-saved map by id and swaps it in, same as `newMap`. */
  private async open(id: string): Promise<void> {
    // A real, registered zone (Ngũ Hành Sơn today) — switch to it the normal
    // way rather than through Supabase, so it isn't stuck waiting on a save
    // that may never have happened. Whatever *was* saved for it still comes
    // back, through the same `autoRestore` an ordinary F2 activation uses.
    if (Object.prototype.hasOwnProperty.call(ZONES, id)) {
      this.openRealZone(id as ZoneId);
      return;
    }
    this.setBusy(true, `Đang mở "${id}"...`);
    const draft = await loadMapDraft<MapDraft>(id);
    if (!draft) {
      this.setBusy(false, `Không tìm thấy map đã lưu với id "${id}".`);
      return;
    }
    this.applyDraft(draft);
    this.setBusy(false, `Đã mở map "${draft.name}".`);
  }

  private openRealZone(id: ZoneId): void {
    for (const item of this.placed.values()) item.node.destroy();
    this.placed.clear();
    this.select(null);
    this.closeContextMenu();
    this.unblockedCells.clear();
    this.tool = null;
    this.ghost?.destroy();
    this.ghost = undefined;
    this.restoreToken++;
    this.isDraftMode = false;

    this.maps.load(id);
    this.importedZoneId = null;
    this.syncBakedProps();
    this.notice(`Đã chuyển sang map "${this.maps.map.name}".`);
    this.emitState();

    this.restoredZoneId = id;
    void this.autoRestore(id);
  }

  /** The first time this zone is visited this scene, pulls back whatever was last saved under its own id, if anything. */
  private async autoRestore(zoneId: string): Promise<void> {
    const myToken = this.restoreToken;
    const draft = await loadMapDraft<MapDraft>(zoneId);
    // The editor could have closed, or moved on to a different zone, while
    // this was in flight — applying a stale fetch now would silently yank
    // back whatever the player is looking at.
    if (!draft || myToken !== this.restoreToken || !this.active || this.maps.map.id !== zoneId) return;
    this.applyDraft(draft);
    this.notice(`Đã khôi phục bản lưu gần nhất của "${draft.name}".`);
  }

  /** Rebuilds the live scene from a saved/blank draft: terrain, props and every marker. */
  private applyDraft(draft: MapDraft): void {
    const map: ZoneDef & { terrain: 'tilemap'; layout: TilemapLayout } = {
      id: draft.id as ZoneId,
      name: draft.name,
      terrain: 'tilemap',
      width: draft.cols * NGUHANHSON_TILE,
      height: draft.rows * NGUHANHSON_TILE,
      ground: 'grass',
      ambient: draft.ambient ?? 0xffffff,
      layout: { cols: draft.cols, rows: draft.rows, ground: draft.ground, overlay: draft.overlay, blocked: draft.blocked, props: draft.props },
      shrine: { x: (draft.cols * NGUHANHSON_TILE) / 2, y: (draft.rows * NGUHANHSON_TILE) / 2 },
      waypoint: { x: (draft.cols * NGUHANHSON_TILE) / 2, y: (draft.rows * NGUHANHSON_TILE) / 2 },
      trees: [],
      rocks: [],
      stones: [],
      plants: [],
      chests: [],
      mobs: [],
      triggers: [],
      portals: [],
    };

    for (const item of this.placed.values()) item.node.destroy();
    this.placed.clear();
    this.select(null);
    this.closeContextMenu();
    this.unblockedCells.clear();
    this.tool = null;
    this.ghost?.destroy();
    this.ghost = undefined;

    this.maps.loadDraft(map);
    this.isDraftMode = true;
    this.restoreToken++;
    this.importedZoneId = null;
    this.restoredZoneId = draft.id;
    // `layout.props` above flows straight into `MapManager.editableProps`,
    // so this pulls the draft's own props in as `origin: 'baked'` for free —
    // exactly what they should read as, since they came from a save, not
    // from anything placed in this particular session.
    this.syncBakedProps();

    for (const m of draft.mobs) {
      this.createMarker('mob', m.x, m.y, {
        kind: m.kind,
        maxCount: m.maxCount ?? 1,
        radius: m.radius ?? 0,
        respawnMs: m.respawnMs ?? 12000,
        ...(m.minLevel ? { minLevel: m.minLevel } : {}),
      });
    }
    for (const c of draft.chests) this.createMarker('chest', c.x, c.y, { tier: c.tier });
    for (const p of draft.portals) {
      this.createMarker('portal', p.x, p.y, { to: p.to, label: p.label, spawnX: p.spawn.x, spawnY: p.spawn.y });
    }
    for (const t of draft.triggers) {
      this.createMarker('trigger', t.shape.x, t.shape.y, { event: t.event, text: t.data.text, radius: t.shape.radius });
    }

    this.emitState();
  }

  /** Everything needed to reconstruct the current map exactly, as one JSON blob. */
  private serializeDraft(): MapDraft {
    const map = this.maps.map;
    const layers = this.maps.tileLayers;
    const cols = layers?.cols ?? 0;
    const rows = layers?.rows ?? 0;
    const ground: number[] = [];
    const overlay: number[] = [];
    if (layers) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ground.push(layers.ground.getTileAt(col, row)?.index ?? -1);
          overlay.push(layers.overlay.getTileAt(col, row)?.index ?? -1);
        }
      }
    }
    const originalBlocked = isTilemapZone(map) ? map.layout.blocked : [];
    const blocked =
      originalBlocked.length === cols * rows
        ? originalBlocked.map((wasBlocked, i) => (this.unblockedCells.has(i) ? false : wasBlocked))
        : new Array(cols * rows).fill(false);

    const props: TilemapProp[] = [];
    const mobs: MobSpawn[] = [];
    const chests: ChestDef[] = [];
    const portals: PortalDef[] = [];
    const triggers: DraftTrigger[] = [];
    for (const item of this.placed.values()) {
      if (item.kind === 'prop') {
        const base = item.sourceDef ? { ...item.sourceDef } : { texture: item.texture, frame: item.frame, solid: item.solid };
        const p: TilemapProp = { ...base, x: item.x, y: item.y };
        if (item.scale !== 1) {
          p.width = Math.round(item.baseWidth * item.scale);
          p.height = Math.round(item.baseHeight * item.scale);
          p.solid = this.scaledSolid(item);
        }
        props.push(p);
      } else if (item.kind === 'mob') {
        mobs.push({
          kind: (item.data.kind as MobKind) ?? 'toad',
          x: item.x,
          y: item.y,
          maxCount: Number(item.data.maxCount ?? 1),
          radius: Number(item.data.radius ?? 0),
          respawnMs: Number(item.data.respawnMs ?? 12000),
          ...(item.data.minLevel ? { minLevel: Number(item.data.minLevel) } : {}),
        });
      } else if (item.kind === 'chest') {
        chests.push({ tier: (item.data.tier as ChestTier) ?? 'common', x: item.x, y: item.y });
      } else if (item.kind === 'portal') {
        portals.push({
          x: item.x,
          y: item.y,
          to: String(item.data.to ?? '') as ZoneId,
          spawn: { x: Number(item.data.spawnX ?? item.x), y: Number(item.data.spawnY ?? item.y) },
          label: String(item.data.label ?? ''),
        });
      } else {
        triggers.push({
          id: String(item.data.id ?? `trigger-${item.id}`),
          shape: { kind: 'circle', x: item.x, y: item.y, radius: Number(item.data.radius ?? 128) },
          event: String(item.data.event ?? 'notice'),
          data: { text: String(item.data.text ?? '') },
        });
      }
    }

    return { id: map.id, name: map.name, ambient: map.ambient, cols, rows, ground, overlay, blocked, props, mobs, chests, portals, triggers };
  }

  private notice(text: string): void {
    this.noticeText = text;
    this.emitState();
  }

  private setBusy(busy: boolean, text?: string): void {
    this.busy = busy;
    if (text !== undefined) this.noticeText = text;
    this.emitState();
  }

  /* ------------------------------------------------------------- output */

  private counts() {
    const counts = { props: 0, mobs: 0, chests: 0, portals: 0, triggers: 0 };
    for (const item of this.placed.values()) {
      if (item.kind === 'prop') counts.props++;
      else if (item.kind === 'mob') counts.mobs++;
      else if (item.kind === 'chest') counts.chests++;
      else if (item.kind === 'portal') counts.portals++;
      else counts.triggers++;
    }
    return counts;
  }

  private toolLabel(): string | null {
    if (!this.tool) return null;
    if (this.tool.kind === 'prop') return this.tool.frame;
    if (this.tool.kind === 'ground') return `Nền: ${this.tool.family}`;
    return MARKER_STYLE[this.tool.kind].label;
  }

  private emitState(exportText?: string): void {
    const selected = this.selectedId !== null ? this.placed.get(this.selectedId) : undefined;
    const selection: EditorSelectionPayload | null = !selected
      ? null
      : selected.kind === 'prop'
        ? {
            id: selected.id,
            kind: 'prop',
            x: Math.round(selected.x),
            y: Math.round(selected.y),
            data: { texture: selected.texture, frame: selected.frame, origin: selected.origin, scale: selected.scale },
          }
        : { id: selected.id, kind: selected.kind, x: Math.round(selected.x), y: Math.round(selected.y), data: selected.data };

    const payload: EditorStatePayload = {
      active: this.active,
      tool: this.toolLabel(),
      counts: this.counts(),
      selection,
      contextMenu: this.contextMenuId !== null ? this.contextMenuScreen : null,
      busy: this.busy,
      notice: this.noticeText,
      ...(exportText !== undefined ? { exportText } : {}),
    };
    GameBus.emit(GameEvent.EditorState, payload);
  }

  /** A map built or opened this session exports as a whole new file; one being tweaked in place exports as patch snippets, as it always has. */
  private exportCode(): string {
    return this.isDraftMode ? this.exportNewZoneModule() : this.exportZonePatch();
  }

  private exportZonePatch(): string {
    const lines: string[] = [];
    const round = (n: number) => Math.round(n);

    const props = [...this.placed.values()].filter((i): i is PlacedProp => i.kind === 'prop');
    lines.push('// --- props: thay TOÀN BỘ mảng props hiện có bằng danh sách này ---');
    lines.push('// (gồm cả prop gốc của map — có thể đã bị bạn di chuyển/xoá — lẫn prop mới thêm)');
    for (const p of props) {
      const base: Partial<TilemapProp> & { x: number; y: number; texture: string; frame: string } = p.sourceDef
        ? { ...p.sourceDef, x: p.x, y: p.y }
        : { x: p.x, y: p.y, texture: p.texture, frame: p.frame, solid: p.solid };
      // Only overrides width/height/solid when the size was actually touched
      // here — an untouched baked prop exports exactly the spec it already
      // had, scaled or not, instead of every one of 198 props suddenly
      // carrying an explicit width/height nobody asked for.
      if (p.scale !== 1) {
        base.width = round(p.baseWidth * p.scale);
        base.height = round(p.baseHeight * p.scale);
        base.solid = this.scaledSolid(p);
      }
      lines.push(serializeProp(base));
    }
    lines.push('');

    const mobs = [...this.placed.values()].filter((i): i is PlacedMarker => i.kind === 'mob');
    if (mobs.length) {
      lines.push('// --- mobs: [...] (chèn vào ZoneDef.mobs) ---');
      for (const m of mobs) {
        const kind = String(m.data.kind ?? 'toad');
        const maxCount = Number(m.data.maxCount ?? 1);
        const radius = Number(m.data.radius ?? 0);
        const respawnMs = Number(m.data.respawnMs ?? 12000);
        const minLevel = m.data.minLevel ? `, minLevel: ${Number(m.data.minLevel)}` : '';
        lines.push(
          `{ kind: '${kind}', x: ${round(m.x)}, y: ${round(m.y)}, maxCount: ${maxCount}, radius: ${radius}, respawnMs: ${respawnMs}${minLevel} },`,
        );
      }
      lines.push('');
    }

    const chests = [...this.placed.values()].filter((i): i is PlacedMarker => i.kind === 'chest');
    if (chests.length) {
      lines.push('// --- chests: [...] (chèn vào ZoneDef.chests) ---');
      for (const c of chests) {
        lines.push(`{ tier: '${String(c.data.tier ?? 'common')}', x: ${round(c.x)}, y: ${round(c.y)} },`);
      }
      lines.push('');
    }

    const portals = [...this.placed.values()].filter((i): i is PlacedMarker => i.kind === 'portal');
    if (portals.length) {
      lines.push('// --- portals: [...] (chèn vào ZoneDef.portals) ---');
      for (const p of portals) {
        lines.push(
          `{ x: ${round(p.x)}, y: ${round(p.y)}, to: '${String(p.data.to ?? '')}', spawn: { x: ${Number(p.data.spawnX ?? p.x)}, y: ${Number(p.data.spawnY ?? p.y)} }, label: '${String(p.data.label ?? '')}' },`,
        );
      }
      lines.push('');
    }

    const triggers = [...this.placed.values()].filter((i): i is PlacedMarker => i.kind === 'trigger');
    if (triggers.length) {
      lines.push('// --- triggers: [...] (chèn vào ZoneDef.triggers) ---');
      for (const t of triggers) {
        const radius = Number(t.data.radius ?? 128);
        lines.push(
          `{ id: '${String(t.data.id ?? `trigger-${t.id}`)}', shape: { kind: 'circle', x: ${round(t.x)}, y: ${round(t.y)}, radius: ${radius} }, event: '${String(t.data.event ?? 'notice')}', data: { text: '${String(t.data.text ?? '')}' } },`,
        );
      }
      lines.push('');
    }

    const map = this.maps.map;
    const layers = this.maps.tileLayers;
    if (layers && isTilemapZone(map)) {
      const { cols, rows } = layers;
      const ground: number[] = [];
      const overlay: number[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ground.push(layers.ground.getTileAt(col, row)?.index ?? -1);
          overlay.push(layers.overlay.getTileAt(col, row)?.index ?? -1);
        }
      }
      const originalBlocked = map.layout.blocked;
      const blocked = originalBlocked.map((wasBlocked, i) => (this.unblockedCells.has(i) ? false : wasBlocked));

      lines.push('// --- nền đất hiện tại (đã gồm phần bạn vẽ) — thay cho layout.ground/overlay/blocked ---');
      lines.push('// blocked[] đã tự bỏ chặn những ô bạn vẽ đè lên (nước cũ hoặc ngoài đảo cũ).');
      lines.push(`const ground = [${ground.join(', ')}];`);
      lines.push(`const overlay = [${overlay.join(', ')}];`);
      lines.push(`const blocked = [${blocked.map((b) => (b ? 'true' : 'false')).join(', ')}];`);
    }

    return lines.join('\n');
  }

  /**
   * A brand-new map has no existing file to patch — this writes the whole
   * `ZoneDef` module instead, with the three manual steps still needed to
   * make it real (register the id, wire a portal) spelled out as comments,
   * since exporting code rather than saving straight into the live game was
   * the whole point of choosing this path.
   */
  private exportNewZoneModule(): string {
    const draft = this.serializeDraft();
    const constName = draft.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const round = (n: number) => Math.round(n);
    const lines: string[] = [];

    lines.push(`// Map mới — tạo một file .ts mới trong src/game/zones/ và dán đoạn dưới vào đó, rồi:`);
    lines.push(`// 1. Thêm '${draft.id}' vào union ZoneId trong src/game/zones/types.ts`);
    lines.push(`// 2. Import ${constName} và thêm vào ZONES + ZONE_ORDER trong src/game/zones/index.ts`);
    lines.push(`// 3. Thêm một portal ở map khác với to: '${draft.id}' để có thể đi vào bằng cách chơi bình thường`);
    lines.push(`import type { TilemapLayout } from '../systems/map/TilemapTerrain';`);
    lines.push(`import type { ZoneDef } from './types';`);
    lines.push('');
    lines.push(`export const ${constName}: ZoneDef & { terrain: 'tilemap'; layout: TilemapLayout } = {`);
    lines.push(`  id: '${draft.id}',`);
    lines.push(`  name: '${draft.name}',`);
    lines.push(`  terrain: 'tilemap',`);
    lines.push(`  width: ${draft.cols * NGUHANHSON_TILE},`);
    lines.push(`  height: ${draft.rows * NGUHANHSON_TILE},`);
    lines.push(`  ground: 'grass',`);
    if (draft.ambient !== undefined) lines.push(`  ambient: 0x${draft.ambient.toString(16)},`);
    lines.push(`  layout: {`);
    lines.push(`    cols: ${draft.cols},`);
    lines.push(`    rows: ${draft.rows},`);
    lines.push(`    ground: [${draft.ground.join(', ')}],`);
    lines.push(`    overlay: [${draft.overlay.join(', ')}],`);
    lines.push(`    blocked: [${draft.blocked.map((b) => (b ? 'true' : 'false')).join(', ')}],`);
    lines.push(`    props: [`);
    for (const p of draft.props) lines.push(`      ${serializeProp(p)}`);
    lines.push(`    ],`);
    lines.push(`  },`);
    const cx = round((draft.cols * NGUHANHSON_TILE) / 2);
    const cy = round((draft.rows * NGUHANHSON_TILE) / 2);
    lines.push(`  // Đặt lại toạ độ shrine/waypoint cho hợp lý — tạm để giữa map.`);
    lines.push(`  shrine: { x: ${cx}, y: ${cy} },`);
    lines.push(`  waypoint: { x: ${cx}, y: ${cy} },`);
    lines.push(`  trees: [],`);
    lines.push(`  rocks: [],`);
    lines.push(`  stones: [],`);
    lines.push(`  plants: [],`);
    lines.push(`  chests: [`);
    for (const c of draft.chests) lines.push(`    { tier: '${c.tier}', x: ${round(c.x)}, y: ${round(c.y)} },`);
    lines.push(`  ],`);
    lines.push(`  mobs: [`);
    for (const m of draft.mobs) {
      const minLevel = m.minLevel ? `, minLevel: ${m.minLevel}` : '';
      lines.push(
        `    { kind: '${m.kind}', x: ${round(m.x)}, y: ${round(m.y)}, maxCount: ${m.maxCount ?? 1}, radius: ${m.radius ?? 0}, respawnMs: ${m.respawnMs ?? 12000}${minLevel} },`,
      );
    }
    lines.push(`  ],`);
    lines.push(`  triggers: [`);
    for (const t of draft.triggers) {
      lines.push(
        `    { id: '${t.id}', shape: { kind: 'circle', x: ${round(t.shape.x)}, y: ${round(t.shape.y)}, radius: ${t.shape.radius} }, event: '${t.event}', data: { text: '${t.data.text}' } },`,
      );
    }
    lines.push(`  ],`);
    lines.push(`  portals: [`);
    for (const p of draft.portals) {
      lines.push(
        `    { x: ${round(p.x)}, y: ${round(p.y)}, to: '${p.to}', spawn: { x: ${round(p.spawn.x)}, y: ${round(p.spawn.y)} }, label: '${p.label}' },`,
      );
    }
    lines.push(`  ],`);
    lines.push(`};`);

    return lines.join('\n');
  }
}

/** Free-text map name → a stable, URL/id-safe key. */
function slugify(name: string): string {
  // NFD splits an accented letter into its base letter plus a combining
  // mark; this drops any character in that Unicode block by code point,
  // built through RegExp() rather than a /…/ literal because the escape
  // sequence keeps getting silently turned into the very accent mark it
  // means to describe when typed as one.
  const COMBINING_MARKS = new RegExp(String.fromCharCode(0x5b) + '\\u0300-\\u036f' + String.fromCharCode(0x5d), 'g');
  return name
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `TilemapProp` as a source line, only the fields actually set. */
function serializeProp(p: Partial<TilemapProp> & { x: number; y: number; texture: string; frame: string }): string {
  const parts = [`x: ${Math.round(p.x)}`, `y: ${Math.round(p.y)}`, `texture: '${p.texture}'`, `frame: '${p.frame}'`];
  if (p.width) parts.push(`width: ${p.width}`);
  if (p.height) parts.push(`height: ${p.height}`);
  if (p.solid) parts.push(`solid: { width: ${p.solid.width}, height: ${p.solid.height} }`);
  if (p.overhead) parts.push('overhead: true');
  if (p.tint !== undefined) parts.push(`tint: 0x${p.tint.toString(16)}`);
  if (p.alpha !== undefined) parts.push(`alpha: ${p.alpha}`);
  if (p.depth !== undefined) parts.push(`depth: ${p.depth}`);
  if (p.unlit) parts.push('unlit: true');
  return `{ ${parts.join(', ')} },`;
}

function defaultData(kind: PlacedMarker['kind'], x: number, y: number): Record<string, string | number> {
  switch (kind) {
    case 'mob':
      return { kind: 'toad', maxCount: 1, radius: 0, respawnMs: 12000 };
    case 'chest':
      return { tier: 'common' };
    case 'portal':
      // Same spot rather than (0, 0): a portal nobody has aimed anywhere yet
      // still exports a `spawn` that lands somewhere sane on the map it
      // stays on, instead of the origin corner — most zones don't have
      // walkable ground there.
      return { to: '', label: 'Cổng mới', spawnX: Math.round(x), spawnY: Math.round(y) };
    case 'trigger':
      return { event: 'notice', text: '', radius: 128 };
  }
}
