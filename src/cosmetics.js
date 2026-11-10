// ─────────────────────────────────────────────────────────────────────────────
// 너굴라이언트 꾸미기 도감 - 주 1회 뽑기로 모으는 색상 · 테마
// 메인 프로세스(require)와 화면(<script>) 양쪽에서 같이 씀.
// id 는 노바 클라이언트 상점과 같게 맞춰서, 노바클에서 가진 걸 그대로 가져올 수 있음.
// ─────────────────────────────────────────────────────────────────────────────
(function (root) {
  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hx = (x) => Math.round(255 * f(x)).toString(16).padStart(2, "0");
    return `#${hx(0)}${hx(8)}${hx(4)}`;
  }

  const RARITY = {
    base: { label: "기본", color: "#93846f", weight: 0 },
    common: { label: "일반", color: "#9aa3ad", weight: 60 },
    rare: { label: "레어", color: "#4fa8ff", weight: 22 },
    epic: { label: "에픽", color: "#b67cff", weight: 13 },
    legendary: { label: "레전더리", color: "#ffbf3f", weight: 5 },
  };

  const HUE_NAMES = [
    "레드", "코럴레드", "오렌지", "골드", "옐로우", "라임옐로우",
    "라임", "그린라임", "그린", "에메랄드", "민트", "스프링그린",
    "틸그린", "시안", "스카이블루", "블루", "코발트블루", "인디고",
    "바이올렛", "퍼플", "마젠타퍼플", "마젠타", "핑크", "로즈",
  ];

  const ITEMS = [];
  // 기본으로 갖고 시작하는 색 (도감 1번)
  ITEMS.push({ id: "nugul-orange", kind: "color", name: "너굴 오렌지", hex: "#f2a65a", rarity: "base" });
  for (let h = 0; h < 360; h += 15) {
    ITEMS.push({ id: `hue-${h}`, kind: "color", name: HUE_NAMES[h / 15], hex: hslToHex(h, 72, 56), rarity: "common" });
  }
  ITEMS.push({ id: "mono-black", kind: "color", name: "블랙", hex: "#3a3a3a", rarity: "rare" });
  ITEMS.push({ id: "mono-white", kind: "color", name: "화이트", hex: "#f2f2f2", rarity: "rare" });
  ITEMS.push({ id: "mono-gray", kind: "color", name: "그레이", hex: "#9aa0a6", rarity: "rare" });

  // 테마: [bg0, bg1, bg2, bg3, border, borderSoft, text0, text1, text2, accent, accentStrong, accentDim, accentInk, scheme]
  const T = (id, name, rarity, v, desc) => ITEMS.push({
    id, kind: "theme", name, rarity, desc,
    hex: v[2], plate: v[9],
    vars: {
      "bg-0": v[0], "bg-1": v[1], "bg-2": v[2], "bg-3": v[3], border: v[4], "border-soft": v[5],
      "text-0": v[6], "text-1": v[7], "text-2": v[8],
      accent: v[9], "accent-strong": v[10], "accent-dim": v[11], "accent-ink": v[12],
    },
    scheme: v[13],
  });
  T("theme-pure-black", "블랙 & 화이트", "epic",
    ["#000000", "#0c0c0c", "#1c1c1c", "#272727", "#353535", "#1c1c1c", "#f4f5f6", "#a5a8b0", "#6d7078", "#e6e6e6", "#ffffff", "#4a4a4a", "#0a0a0a", "dark"],
    "색을 뺀 흑백 모노톤");
  T("theme-cute", "핑크", "epic",
    ["#f1cddd", "#edc2d5", "#e5b8ce", "#daa9c2", "#de97b7", "#e2b0cc", "#4b1c33", "#7c4259", "#a06a84", "#e63d83", "#cf2a6e", "#e299ba", "#ffffff", "light"],
    "포근한 로즈 핑크");
  T("theme-black-pink", "블랙 & 핑크", "epic",
    ["#050105", "#1d0a15", "#2e1122", "#40182e", "#6d2a4d", "#331327", "#ffeff7", "#e0b0c8", "#a87c94", "#ff2e8b", "#ff6fae", "#96205a", "#120008", "dark"],
    "칠흑 위에 네온 핑크");
  T("theme-forest", "숲속 마을", "epic",
    ["#0d1510", "#152019", "#1e2c23", "#28392e", "#3c5243", "#1f2c24", "#eef6ee", "#b5c9b8", "#7f9583", "#8ccf6a", "#aee58f", "#3f6b33", "#0c1a08", "dark"],
    "채집섬의 나뭇잎 색");
  T("theme-aqua", "아쿠아", "legendary",
    ["#062430", "#0a3446", "#0f4459", "#145670", "#2d7d93", "#1b5568", "#eaf9fb", "#a9d8de", "#74a8b1", "#2fb8ec", "#5fd4f7", "#0f6a8c", "#041c26", "dark"],
    "낚시터의 깊은 바다");
  T("theme-sky", "스카이", "legendary",
    ["#100c2e", "#1a1440", "#241c54", "#302668", "#6c62a6", "#453d7c", "#f1edff", "#c3b9ec", "#8d81bd", "#a78bfa", "#c4b1ff", "#5b4aa8", "#150f30", "dark"],
    "별이 뜨는 밤하늘");
  T("theme-metal", "메탈", "legendary",
    ["#101220", "#181a28", "#222434", "#2d3043", "#464a63", "#2a2d3e", "#eef1f8", "#b6bccd", "#7f8598", "#5cc6da", "#8fdfef", "#2b6a79", "#07141a", "dark"],
    "광산에서 캐낸 금속");
  T("theme-sunset", "노을 섬", "legendary",
    ["#1a0f14", "#26151b", "#341d24", "#43262e", "#6a3d44", "#2f1a20", "#fff1ea", "#e3bfb2", "#a98a80", "#ff8a5c", "#ffad89", "#8a3f2a", "#200b04", "dark"],
    "마인팜 섬에 지는 노을");
  T("theme-nugul", "너굴 원목", "legendary",
    ["#15110d", "#1e1914", "#2a231c", "#352c24", "#4a3f34", "#2f2720", "#f6efe5", "#cdbfad", "#93846f", "#f2a65a", "#ffbd78", "#8a5a2b", "#2b1606", "dark"],
    "너굴마을 오두막 원목");

  // 뽑기 없이 고르는 기본 바탕 (설정 > 화면)
  const BASE_MODES = {
    gray: {
      name: "그레이",
      scheme: "dark",
      vars: { "bg-0": "#0c0e14", "bg-1": "#191b21", "bg-2": "#292c33", "bg-3": "#373a42", border: "#444750", "border-soft": "#24272e", "text-0": "#f1f1f2", "text-1": "#b6bcc8", "text-2": "#808695" },
    },
    white: {
      name: "화이트",
      scheme: "light",
      vars: { "bg-0": "#eef1f6", "bg-1": "#f8f9fc", "bg-2": "#e9ecf2", "bg-3": "#dde1e9", border: "#c9ced8", "border-soft": "#e0e4eb", "text-0": "#1a1c22", "text-1": "#41434c", "text-2": "#6d707a" },
    },
  };

  const FONTS = {
    suit: { name: "SUIT (기본)", css: '"SUIT", "Malgun Gothic", sans-serif' },
    malgun: { name: "맑은 고딕", css: '"Malgun Gothic", "SUIT", sans-serif' },
    nanum: { name: "나눔고딕", css: '"NanumGothic", "나눔고딕", "Malgun Gothic", sans-serif' },
    nanumsquare: { name: "나눔스퀘어", css: '"NanumSquare", "나눔스퀘어", "Malgun Gothic", sans-serif' },
    gulim: { name: "굴림", css: '"Gulim", "굴림", sans-serif' },
  };

  const api = { RARITY, ITEMS, BASE_MODES, FONTS, byId: (id) => ITEMS.find((i) => i.id === id) || null };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.COSMETICS = api;
})(typeof window !== "undefined" ? window : globalThis);
