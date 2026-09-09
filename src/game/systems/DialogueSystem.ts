/**
 * What an NPC says, and what saying it does.
 *
 * Until now an NPC had no words at all. `interactNpc` switched on the NPC's
 * `role` and opened a panel — merchant opened the shop, gem opened the bag,
 * everyone else opened the quest log — so the elder who is supposed to induct
 * you into the sect and the pedlar who sells you potions were the same
 * interaction with a different window attached.
 *
 * A conversation is data. This file holds the machine that walks it and the
 * shapes it walks; the words themselves live in `data/dialogue.ts` and the
 * things a line can *do* are named here and carried out by the scene. Nothing
 * in here opens a panel, starts a quest or gives an item — a dialogue that
 * could reach the bag would be content with write access to the save.
 *
 * Pure and Phaser-free so the branching can be tested without a browser.
 */

/** What a line asks the scene to do once it has been read. */
export type DialogueEffect =
  /** Open a UI panel. The scene knows which bus event that is. */
  | { kind: 'panel'; panel: 'shop' | 'quests' | 'bag' | 'alchemy' | 'storage' }
  /** Offer a quest by id; refused silently if it is not available. */
  | { kind: 'offer'; questId: string }
  /** Claim a finished quest's reward. */
  | { kind: 'claim'; questId: string }
  /** Credit a `talk` objective — the thing `applyQuestEvent` already does. */
  | { kind: 'credit'; target: string }
  /** Set a world flag, so a line can be said once ever. See `WorldFlags`. */
  | { kind: 'flag'; name: string };

export interface DialogueChoice {
  text: string;
  /** Where the conversation goes. Omitted ends it. */
  goto?: string;
  effects?: readonly DialogueEffect[];
  /**
   * Hidden unless the scene says so.
   *
   * A name, not a predicate: the condition is gameplay — a level, a finished
   * quest, an item in the bag — and evaluating it here would drag the whole
   * game into a dialogue file.
   */
  requires?: string;
}

export interface DialogueNode {
  id: string;
  /** Who is talking. Absent means the NPC the conversation started from. */
  speaker?: string;
  /** One screen of text. Long speeches are several nodes, not one long line. */
  text: string;
  /** Run when the node is *shown*, once. */
  effects?: readonly DialogueEffect[];
  /** Player replies. Empty or absent means "press to continue". */
  choices?: readonly DialogueChoice[];
  /** Where "continue" goes when there are no choices. Omitted ends it. */
  goto?: string;
}

export interface DialogueTree {
  id: string;
  /** Fallback speaker name for nodes that do not give one. */
  speaker: string;
  start: string;
  nodes: readonly DialogueNode[];
}

/** What the UI needs to draw the current moment. */
export interface DialogueView {
  treeId: string;
  nodeId: string;
  speaker: string;
  text: string;
  choices: readonly { index: number; text: string }[];
  /** True when the only input is "continue". */
  continues: boolean;
}

export interface DialogueHost {
  /** Carries out an effect. Called once per effect, in declaration order. */
  run(effect: DialogueEffect): void;
  /** Answers a choice's `requires`. Absent means everything is available. */
  allows?(requirement: string): boolean;
}

export class DialogueSystem {
  private trees = new Map<string, DialogueTree>();
  private tree: DialogueTree | null = null;
  private node: DialogueNode | null = null;

  constructor(
    private readonly host: DialogueHost,
    trees: readonly DialogueTree[] = [],
  ) {
    for (const tree of trees) this.trees.set(tree.id, tree);
  }

  get active(): boolean {
    return this.node !== null;
  }

  /**
   * Opens a conversation. False if there is no such tree, which is not a throw:
   * an NPC pointing at a dialogue nobody wrote should fall back to the panel it
   * used to open, not stop the game.
   */
  start(treeId: string): boolean {
    const tree = this.trees.get(treeId);
    if (!tree) return false;
    const first = tree.nodes.find((node) => node.id === tree.start);
    if (!first) {
      console.error(`dialogue "${treeId}": khong co node bat dau "${tree.start}"`);
      return false;
    }
    this.tree = tree;
    this.enter(first);
    return true;
  }

  /** The current moment, or null when nothing is being said. */
  view(): DialogueView | null {
    if (!this.tree || !this.node) return null;
    const choices = this.visibleChoices();
    return {
      treeId: this.tree.id,
      nodeId: this.node.id,
      speaker: this.node.speaker ?? this.tree.speaker,
      text: this.node.text,
      choices: choices.map((choice, index) => ({ index, text: choice.text })),
      continues: choices.length === 0,
    };
  }

  /** Advances a node that has no choices. Ends the conversation at the last. */
  advance(): void {
    if (!this.node || this.visibleChoices().length > 0) return;
    this.goto(this.node.goto);
  }

  /**
   * Takes a reply.
   *
   * The index is into the *visible* choices, which is what the UI drew — using
   * the raw list would fire the wrong branch the moment a requirement hides
   * one.
   */
  choose(index: number): void {
    const choices = this.visibleChoices();
    const choice = choices[index];
    if (!choice) return;
    for (const effect of choice.effects ?? []) this.host.run(effect);
    this.goto(choice.goto);
  }

  end(): void {
    this.tree = null;
    this.node = null;
  }

  private visibleChoices(): readonly DialogueChoice[] {
    if (!this.node?.choices) return [];
    return this.node.choices.filter(
      (choice) => !choice.requires || (this.host.allows?.(choice.requires) ?? true),
    );
  }

  private goto(nodeId: string | undefined): void {
    if (!nodeId) {
      this.end();
      return;
    }
    const next = this.tree?.nodes.find((node) => node.id === nodeId);
    if (!next) {
      // A dangling `goto` ends the conversation rather than freezing it on the
      // node it could not leave.
      console.error(`dialogue "${this.tree?.id}": goto tro den node khong co "${nodeId}"`);
      this.end();
      return;
    }
    this.enter(next);
  }

  /** Shows a node and runs what showing it does. */
  private enter(node: DialogueNode): void {
    this.node = node;
    for (const effect of node.effects ?? []) this.host.run(effect);
  }
}

/** Every problem in a set of trees, for a test and for the debug overlay. */
export function dialogueProblems(trees: readonly DialogueTree[]): string[] {
  const out: string[] = [];
  for (const tree of trees) {
    const ids = new Set(tree.nodes.map((node) => node.id));
    if (ids.size !== tree.nodes.length) out.push(`${tree.id}: co node trung id`);
    if (!ids.has(tree.start)) out.push(`${tree.id}: start "${tree.start}" khong ton tai`);
    for (const node of tree.nodes) {
      const targets = [node.goto, ...(node.choices ?? []).map((c) => c.goto)];
      for (const target of targets) {
        if (target && !ids.has(target)) {
          out.push(`${tree.id}/${node.id}: goto "${target}" khong ton tai`);
        }
      }
      if (node.choices?.length && node.goto) {
        // Both would mean the `goto` is dead: `advance` refuses to run while a
        // node has choices, so the only way out is a reply.
        out.push(`${tree.id}/${node.id}: co ca choices va goto — goto se khong bao gio chay`);
      }
    }
    // A node nothing reaches is content that cannot be seen.
    const reached = new Set<string>([tree.start]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of tree.nodes) {
        if (!reached.has(node.id)) continue;
        for (const target of [node.goto, ...(node.choices ?? []).map((c) => c.goto)]) {
          if (target && ids.has(target) && !reached.has(target)) {
            reached.add(target);
            grew = true;
          }
        }
      }
    }
    for (const node of tree.nodes) {
      if (!reached.has(node.id)) out.push(`${tree.id}/${node.id}: khong duong nao den`);
    }
  }
  return out;
}
