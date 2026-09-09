import type { DialogueTree } from '../systems/DialogueSystem';

/**
 * What the seven NPCs say.
 *
 * Words only. A line may *ask* for a panel, a quest or a flag — see
 * `DialogueEffect` — and `WorldScene` is what carries that out; nothing here
 * can reach the bag or the save directly.
 *
 * The trees are short on purpose. Each ends in one of two places: the panel the
 * NPC used to open on contact, or nothing. That is the whole gain — the panel
 * still opens, but now somebody says why first, and the elder who inducts you
 * and the pedlar who sells to you are no longer the same interaction with a
 * different window on the end.
 *
 * `requires` names a condition the scene answers; it never evaluates one here.
 */
export const DIALOGUE_TREES: readonly DialogueTree[] = [
  /* ------------------------------------------------- Ngoại môn luyện địa */
  {
    id: 'truong-lao',
    speaker: 'Trưởng Lão Ngoại Môn',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        /*
         * Order matters, and it is the reason both effects sit on this node.
         *
         * `q01-nhap-mon`'s single objective is "bái kiến trưởng lão" — being
         * spoken to *is* the quest — so it has to be accepted before the talk
         * is credited or the credit lands on a quest nobody holds. Crediting
         * on a reply instead would let the player finish the greeting without
         * finishing the errand.
         */
        effects: [
          { kind: 'offer', questId: 'q01-nhap-mon' },
          { kind: 'credit', target: 'truong-lao' },
        ],
        text: 'Ngươi tới rồi. Ngoại môn không nuôi kẻ nhàn rỗi — muốn ở lại thì phải có công.',
        choices: [
          { text: 'Xin trưởng lão chỉ dạy.', goto: 'induct' },
          { text: 'Ta muốn xem lại nhiệm vụ.', effects: [{ kind: 'panel', panel: 'quests' }] },
          { text: 'Chưa phải lúc.' },
        ],
      },
      {
        id: 'induct',
        text: 'Xuống bãi thử luyện, hạ ba con Linh Cóc. Đơn giản thôi — nhưng ta xem cách ngươi làm.',
        effects: [{ kind: 'offer', questId: 'q02-thu-luyen' }],
        goto: 'induct-close',
      },
      {
        id: 'induct-close',
        text: 'Xong thì về đây. Đừng để ta phải đi tìm.',
        choices: [
          { text: 'Mở sổ nhiệm vụ.', effects: [{ kind: 'panel', panel: 'quests' }] },
          { text: 'Rõ.' },
        ],
      },
    ],
  },
  {
    id: 'duoc-su',
    speaker: 'Dược Sư',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        effects: [{ kind: 'credit', target: 'duoc-su' }],
        text: 'Thảo dược của ngươi đâu? À — hay là tới mua? Ta bán cả hai chiều.',
        choices: [
          { text: 'Cho ta xem hàng.', effects: [{ kind: 'panel', panel: 'shop' }] },
          { text: 'Ta có thảo dược cần giao.', goto: 'deliver' },
          { text: 'Chỉ ghé qua.' },
        ],
      },
      {
        id: 'deliver',
        text: 'Đưa đây. Thanh Linh Thảo tươi thì hơn khô — lần sau đừng để trong túi ba ngày.',
        effects: [{ kind: 'claim', questId: 'q03-linh-thao' }],
        goto: 'deliver-close',
      },
      {
        id: 'deliver-close',
        text: 'Cần gì nữa thì nói. Ta còn ở đây.',
        choices: [
          { text: 'Xem hàng.', effects: [{ kind: 'panel', panel: 'shop' }] },
          { text: 'Đủ rồi.' },
        ],
      },
    ],
  },
  {
    id: 'khambao-su',
    speaker: 'Khảm Bảo Sư',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        text: 'Ngọc thô thì chỉ là đá. Đưa ta khảm vào binh khí, nó mới thành sức mạnh.',
        choices: [
          { text: 'Ta có ngọc muốn khảm.', effects: [{ kind: 'panel', panel: 'bag' }] },
          { text: 'Khảm thế nào?', goto: 'how' },
          { text: 'Để sau.' },
        ],
      },
      {
        id: 'how',
        text: 'Binh khí có lỗ thì khảm được. Hồng tăng công, Lam tăng linh lực, Lục tăng máu, Hoàng tăng phòng. Bậc càng cao càng mạnh.',
        choices: [
          { text: 'Mở túi.', effects: [{ kind: 'panel', panel: 'bag' }] },
          { text: 'Ta hiểu rồi.' },
        ],
      },
    ],
  },
  {
    id: 'luyen-dan-su',
    speaker: 'Luyện Đan Sư',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        text: 'Lò còn nóng. Có nguyên liệu thì ta luyện — không có thì đừng đứng gần, cháy áo.',
        choices: [
          { text: 'Luyện đan.', effects: [{ kind: 'panel', panel: 'alchemy' }] },
          { text: 'Ta cần đan gì để đột phá?', goto: 'advice' },
          { text: 'Ta đi đã.' },
        ],
      },
      {
        id: 'advice',
        text: 'Trúc Cơ đan cho tầng Trúc Cơ, Kết Đan đan cho tầng sau. Thiếu linh cốt thì đi săn — yêu thú mang trong mình cả.',
        choices: [
          { text: 'Mở lò.', effects: [{ kind: 'panel', panel: 'alchemy' }] },
          { text: 'Rõ.' },
        ],
      },
    ],
  },
  {
    id: 'du-phuong-thuong',
    speaker: 'Du Phương Thương',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        effects: [{ kind: 'credit', target: 'du-phuong-thuong' }],
        text: 'Ta đi khắp bốn cốc. Nghe nhiều chuyện — có chuyện bán được, có chuyện cho không.',
        choices: [
          { text: 'Kể ta nghe chuyện cho không.', goto: 'rumour' },
          { text: 'Ta xem hàng.', effects: [{ kind: 'panel', panel: 'shop' }] },
          { text: 'Không rảnh.' },
        ],
      },
      {
        id: 'rumour',
        text: 'Huyết Ma Cốc phía đông rừng. Trong đó có thứ canh sàn đá — ai vào cũng ra, nhưng không ai ra nguyên vẹn.',
        choices: [
          { text: 'Ta sẽ tới đó.', effects: [{ kind: 'offer', questId: 'q07-huyet-ma-coc' }] },
          { text: 'Nghe đủ rồi.' },
        ],
      },
    ],
  },

  /* -------------------------------------------------------- Huyết Ma Cốc */
  {
    id: 'de-tu-bi-thuong',
    speaker: 'Đệ Tử Bị Thương',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        effects: [{ kind: 'credit', target: 'de-tu-bi-thuong' }],
        text: 'Đừng… đừng vào sâu. Sàn đá phía đông. Nó đợi ở đó — chúng ta bảy người, ta là người duy nhất bò ra.',
        choices: [
          { text: 'Ngươi còn đi được không?', goto: 'wound' },
          { text: 'Ta sẽ hạ nó.', goto: 'resolve' },
        ],
      },
      {
        id: 'wound',
        text: 'Được… đủ để về. Ngươi thì đừng đi một mình. Ta nói vậy thôi, biết ngươi vẫn đi.',
        goto: 'resolve',
      },
      {
        id: 'resolve',
        text: 'Vậy thì nhớ: nó đánh theo nhịp. Nhịp thứ ba là nhịp giết người.',
        choices: [{ text: 'Ta nhớ.' }],
      },
    ],
  },

  /* ------------------------------------------------------ Thanh Phong Cốc */
  {
    id: 'phong-linh-su',
    speaker: 'Phong Linh Sứ',
    start: 'greet',
    nodes: [
      {
        id: 'greet',
        effects: [{ kind: 'credit', target: 'phong-linh-su' }],
        text: 'Gió ở đây đọc được người. Ngươi vào tới đây, nghĩa là gió chưa đẩy ngươi ra.',
        choices: [
          { text: 'Trong cốc có gì?', goto: 'valley' },
          { text: 'Ta xem nhiệm vụ.', effects: [{ kind: 'panel', panel: 'quests' }] },
          { text: 'Ta tự đi.' },
        ],
      },
      {
        id: 'valley',
        text: 'Phong Ma ngủ giữa cốc. Nó không hung như Huyết Ma — nó chỉ nhanh hơn ngươi. Khác nhau ở chỗ chết nhanh hay chết chậm.',
        choices: [{ text: 'Đủ rồi.' }],
      },
    ],
  },
];
