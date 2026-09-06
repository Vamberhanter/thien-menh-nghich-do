/** In-game “Tin tức / cập nhật” feed shown in the right SideDock. */

export interface PatchNote {
  id: string;
  date: string;
  title: string;
  items: readonly string[];
}

export const PATCH_NOTES: readonly PatchNote[] = [
  {
    id: '2026-09-07',
    date: '07/09/2026',
    title: 'Linh Điền & giao diện',
    items: [
      'Khu Linh Điền luôn hiện ô đất / hàng rào (kể cả khi thiếu asset).',
      'Panel bên phải: tin cập nhật + chat đồng đạo (mở / đóng).',
      'Favicon game (sigil) trên tab trình duyệt.',
      'Túi đồ to hơn; dùng nhanh máu / linh; stack tối đa 20/ô.',
      'Menu Điều khiển: bàn phím / nút cảm ứng / tay cầm.',
    ],
  },
  {
    id: '2026-09-content',
    date: '09/2026',
    title: 'Nội dung tu luyện',
    items: [
      'Luyện đan tại NPC Luyện Đan Sư.',
      'Thiên kiếp trước khi đột phá cảnh giới.',
      'Zone Thanh Phong Cốc + boss Phong Ma (cửa cần cấp ≥ 10).',
      'Skill kit theo rank cây kỹ năng (K / L / Space / U).',
      'Farm Linh Điền: trồng, tưới, thu hoạch.',
    ],
  },
  {
    id: 'welcome',
    date: 'Khởi đầu',
    title: 'Thiên Mệnh Nghịch Đồ',
    items: [
      'Tu luyện, nhiệm vụ, kho báu và đồng đạo trên cùng một bản đồ.',
      'Huyết mạch / dịch chuyển để hồi phủ và đổi khu.',
      'Chat lobby khi chưa vào thế giới; chat trong game ở panel phải.',
    ],
  },
];
