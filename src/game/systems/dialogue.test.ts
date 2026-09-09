import { describe, expect, it } from 'vitest';
import {
  DialogueSystem,
  dialogueProblems,
  type DialogueEffect,
  type DialogueTree,
} from './DialogueSystem';
import { DIALOGUE_TREES } from '../data/dialogue';
import { NPCS, dialogueIdFor } from './NpcSystem';

function harness(trees: DialogueTree[], allows?: (r: string) => boolean) {
  const ran: DialogueEffect[] = [];
  const system = new DialogueSystem({ run: (e) => ran.push(e), allows }, trees);
  return { system, ran };
}

const tree: DialogueTree = {
  id: 't',
  speaker: 'Ông Lão',
  start: 'a',
  nodes: [
    { id: 'a', text: 'Một', effects: [{ kind: 'credit', target: 'x' }], goto: 'b' },
    {
      id: 'b',
      text: 'Hai',
      choices: [
        { text: 'Nhận', effects: [{ kind: 'offer', questId: 'q' }], goto: 'c' },
        { text: 'Thôi' },
        { text: 'Bí mật', requires: 'flag:biet', goto: 'c' },
      ],
    },
    { id: 'c', speaker: 'Khác', text: 'Ba' },
  ],
};

describe('DialogueSystem', () => {
  it('refuses a tree nobody wrote, rather than throwing', () => {
    const { system } = harness([tree]);
    expect(system.start('khong-co')).toBe(false);
    expect(system.active).toBe(false);
    expect(system.view()).toBeNull();
  });

  it('runs a node’s effects when the node is shown, once', () => {
    const { system, ran } = harness([tree]);
    system.start('t');
    expect(ran).toEqual([{ kind: 'credit', target: 'x' }]);
    // Reading the view again must not re-fire it — the credit is a quest
    // objective, and firing it per render would count the same greeting twice.
    system.view();
    system.view();
    expect(ran).toHaveLength(1);
  });

  it('continues while a node has no choices, and stops when it has', () => {
    const { system } = harness([tree]);
    system.start('t');
    expect(system.view()?.continues).toBe(true);
    system.advance();
    expect(system.view()?.nodeId).toBe('b');
    expect(system.view()?.continues).toBe(false);
    // `advance` on a node with choices does nothing: the only way out is a reply.
    system.advance();
    expect(system.view()?.nodeId).toBe('b');
  });

  it('falls back to the tree’s speaker, and lets a node override it', () => {
    const { system } = harness([tree]);
    system.start('t');
    expect(system.view()?.speaker).toBe('Ông Lão');
    system.advance();
    system.choose(0);
    expect(system.view()?.speaker).toBe('Khác');
  });

  it('ends on a choice with no `goto`', () => {
    const { system } = harness([tree]);
    system.start('t');
    system.advance();
    system.choose(1);
    expect(system.active).toBe(false);
  });

  it('hides a choice whose requirement is unmet, and re-indexes the rest', () => {
    const closed = harness([tree], () => false);
    closed.system.start('t');
    closed.system.advance();
    expect(closed.system.view()?.choices.map((c) => c.text)).toEqual(['Nhận', 'Thôi']);

    const open = harness([tree], () => true);
    open.system.start('t');
    open.system.advance();
    expect(open.system.view()?.choices).toHaveLength(3);
    // Index 2 is the hidden one in the closed case; picking it there must not
    // fire — which is why `choose` indexes the *visible* list.
    closed.system.choose(2);
    expect(closed.system.view()?.nodeId).toBe('b');
    open.system.choose(2);
    expect(open.system.view()?.nodeId).toBe('c');
  });

  it('ends rather than freezing on a dangling goto', () => {
    const broken: DialogueTree = {
      id: 'b',
      speaker: 'X',
      start: 'a',
      nodes: [{ id: 'a', text: 'đi đâu', goto: 'khong-co' }],
    };
    const { system } = harness([broken]);
    system.start('b');
    system.advance();
    expect(system.active).toBe(false);
  });
});

describe('dialogueProblems', () => {
  it('finds a missing start, a dangling goto, an orphan, and a dead goto', () => {
    const bad: DialogueTree[] = [
      { id: 'no-start', speaker: 'X', start: 'nope', nodes: [{ id: 'a', text: '.' }] },
      {
        id: 'dangling',
        speaker: 'X',
        start: 'a',
        nodes: [{ id: 'a', text: '.', goto: 'ghost' }],
      },
      {
        id: 'orphan',
        speaker: 'X',
        start: 'a',
        nodes: [
          { id: 'a', text: '.' },
          { id: 'b', text: 'khong ai den' },
        ],
      },
      {
        id: 'both',
        speaker: 'X',
        start: 'a',
        nodes: [
          { id: 'a', text: '.', goto: 'b', choices: [{ text: 'x', goto: 'b' }] },
          { id: 'b', text: '.' },
        ],
      },
    ];
    const problems = dialogueProblems(bad);
    expect(problems.some((p) => p.includes('start "nope"'))).toBe(true);
    expect(problems.some((p) => p.includes('goto "ghost"'))).toBe(true);
    expect(problems.some((p) => p.includes('orphan/b: khong duong nao den'))).toBe(true);
    expect(problems.some((p) => p.includes('ca choices va goto'))).toBe(true);
  });
});

describe('the dialogue the game ships', () => {
  it('has no broken links, orphans or duplicate ids', () => {
    expect(dialogueProblems(DIALOGUE_TREES)).toEqual([]);
  });

  it('gives every NPC in the roster a tree', () => {
    const ids = new Set(DIALOGUE_TREES.map((t) => t.id));
    for (const npc of NPCS) {
      expect(ids.has(dialogueIdFor(npc)), `${npc.id}: khong co cay doi thoai`).toBe(true);
    }
  });

  it('names only effects the scene can carry out', () => {
    const known = new Set(['panel', 'offer', 'claim', 'credit', 'flag']);
    const panels = new Set(['shop', 'quests', 'bag', 'alchemy', 'storage']);
    for (const t of DIALOGUE_TREES) {
      for (const node of t.nodes) {
        const effects = [...(node.effects ?? []), ...(node.choices ?? []).flatMap((c) => c.effects ?? [])];
        for (const effect of effects) {
          expect(known.has(effect.kind), `${t.id}/${node.id}: effect "${effect.kind}"`).toBe(true);
          if (effect.kind === 'panel') {
            expect(panels.has(effect.panel), `${t.id}/${node.id}: panel "${effect.panel}"`).toBe(true);
          }
        }
      }
    }
  });
});
