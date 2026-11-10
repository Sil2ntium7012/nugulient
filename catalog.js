// ─────────────────────────────────────────────────────────────────────────────
// 너굴라이언트 - 서버/링크/전용 모드 목록
// 주소나 모드 버전이 바뀌면 이 파일만 고치면 됩니다. (출처: https://mcng.kr/wiki)
// ─────────────────────────────────────────────────────────────────────────────

const SITE = "https://mcng.kr";
const WIKI = `${SITE}/wiki`;
const wiki = (anchor) => `${WIKI}#${encodeURIComponent(anchor)}`;

const SERVER = {
  name: "너굴마을",
  host: "mcng.kr",
  port: 25565,
  mcVersion: "26.1.2",
  loader: "fabric",
};

// 화면에 쓰는 사이트 이미지 - 너굴마을 운영진 허락 받음(비상업적 사용).
// 런처가 하루 한 번 받아서 %APPDATA%\Nugulient\tools\images 에 저장해 두고, 인터넷이 없어도 그걸 보여줘요.
const IMAGES = {
  logo: `${SITE}/assets/img/logo.png`,
  panorama: `${SITE}/assets/img/server-panorama.png?v=20260919`,
};

const LINKS = {
  site: SITE,
  wiki: WIKI,
  ranking: `${SITE}/ranking`,
  player: `${SITE}/player`,
  rules: `${SITE}/rules`,
  shop: `${SITE}/shop`,
  community: `${SITE}/community`,
  discord: "https://discord.com/invite/J93v5WfMPe",
  minelist: "https://minelist.kr/servers/16471-mcng.kr",
  namemcSkins: "https://namemc.com/minecraft-skins",
};

// 홈 화면 컨텐츠 카드 (사이트 메인과 같은 8개)
const CONTENTS = [
  { title: "마인팜", tag: "나만의 섬", desc: "나만의 섬을 꾸미며 성장하는 힐링 컨텐츠", url: wiki("메인컨텐츠-마인팜") },
  { title: "던전", tag: "RPG", desc: "자체 제작 귀여운 몬스터와 함께 성장", url: wiki("메인컨텐츠-던전") },
  { title: "채집", tag: "채집섬", desc: "매일 다른 섬으로 날아가 식재료 채집", url: wiki("서브컨텐츠-채집") },
  { title: "광산", tag: "오버월드", desc: "광활한 오버월드에서 즐기는 자유로운 광산", url: wiki("메인컨텐츠-광산") },
  { title: "요리", tag: "시세", desc: "매일 바뀌는 요리 가격에 맞춰 요리하기", url: wiki("메인컨텐츠-요리") },
  { title: "낚시", tag: "미니게임", desc: "귀여운 미니게임과 다양한 물고기", url: wiki("메인컨텐츠-낚시") },
  { title: "무역", tag: "섬 경쟁", desc: "친구들과 힘을 합치는 섬 단위 경쟁", url: wiki("서브컨텐츠-무역") },
  { title: "보스 (수로)", tag: "개인 경쟁", desc: "매일매일 보상 가득한 개인 경쟁", url: wiki("메인컨텐츠-던전") },
];

// 위키 바로가기 (위키 화면)
const WIKI_SECTIONS = [
  {
    group: "첫걸음",
    items: [
      ["서버 정보", "첫걸음-서버정보"],
      ["접속방법", "첫걸음-접속방법"],
      ["디코인증", "첫걸음-디코인증"],
      ["명령어", "첫걸음-명령어"],
    ],
  },
  {
    group: "메인컨텐츠",
    items: [
      ["마인팜", "메인컨텐츠-마인팜"],
      ["레벨 · 스킬", "메인컨텐츠-레벨"],
      ["요리", "메인컨텐츠-요리"],
      ["던전 · 몬스터", "메인컨텐츠-던전"],
      ["광산", "메인컨텐츠-광산"],
      ["낚시 · 도감", "메인컨텐츠-낚시"],
    ],
  },
  {
    group: "서브컨텐츠",
    items: [
      ["무역", "서브컨텐츠-무역"],
      ["채집", "서브컨텐츠-채집"],
      ["일일퀘스트", "서브컨텐츠-일일퀘스트"],
      ["허수아비", "서브컨텐츠-허수아비"],
      ["치장", "서브컨텐츠-치장"],
      ["도구 스킨", "서브컨텐츠-치장-도구스킨"],
      ["한글 닉네임", "서브컨텐츠-치장-한글닉네임"],
      ["광물 생성기", "서브컨텐츠-광물생성기"],
    ],
  },
  {
    group: "강화",
    items: [
      ["장비제작", "강화-장비제작"],
      ["일반강화", "강화-일반강화"],
      ["초월강화", "강화-초월강화"],
      ["큐브각인", "강화-큐브각인"],
    ],
  },
  {
    group: "보상 · 편의",
    items: [
      ["핫타임", "보상-핫타임"],
      ["접속보상", "보상-접속보상"],
      ["추천 보상", "보상-추천보상"],
      ["상자잠금", "편의기능-상자잠금"],
      ["엘리베이터", "편의기능-엘리베이터"],
      ["시세", "편의기능-시세"],
    ],
  },
].map((g) => ({ group: g.group, items: g.items.map(([label, anchor]) => ({ label, url: wiki(anchor) })) }));

// 너굴마을 전용 모드 - 사이트에 올라온 파일을 그대로 받아서 mods 폴더에 넣습니다.
//   kind: "jar"  -> 그대로 저장
//   kind: "zip"  -> 압축 안의 jar 중 patterns 에 맞는 것만 꺼냄
// patterns 는 "이 모드의 파일"을 알아보는 규칙 - 설치 여부 확인/옛 버전 삭제에 씀
const NEOGUL_MODS = [
  {
    id: "skillkeydown",
    name: "스킬 키 세팅",
    sub: "NG-SkillKeydown",
    desc: "게임 안에서 /스킬키세팅 으로 스킬마다 원하는 키를 지정해요.",
    wiki: wiki("편의기능-스킬키세팅"),
    downloads: [{ url: `${SITE}/mods/ng-skillkeydown.zip`, kind: "zip" }],
    patterns: ["^ng-skillkeydown-.*\\.jar$"],
  },
  {
    id: "voice",
    name: "보이스챗",
    sub: "Simple Voice Chat + 너굴마을 보이스",
    desc: "처음 접속하면 나오는 안내 창에서 마이크·스피커·말하기 방식을 정하면 돼요.",
    wiki: wiki("편의기능-보이스챗"),
    downloads: [
      { url: `${SITE}/mods/ng-voiceaddon.zip?v=1.10.0`, kind: "zip" },
      { url: `${SITE}/mods/fabric-api-0.155.3+26.1.2.jar`, kind: "jar" },
    ],
    patterns: ["^voicechat-fabric-.*\\.jar$", "^ng-voiceaddon-.*\\.jar$"],
    // Fabric API 는 다른 모드도 같이 쓰므로 지울 때는 남겨두고, 있으면 다시 받지 않음
    shared: ["^fabric-api-.*\\.jar$"],
  },
  {
    id: "koreanchat",
    name: "한글채팅",
    sub: "NG-KoreanChat 2.1.4",
    desc: "채팅창 왼쪽에 한/A 가 보이면 적용된 거예요. 한/영 키나 오른쪽 Alt 로 전환해요.",
    wiki: wiki("편의기능-한글채팅"),
    downloads: [{ url: `${SITE}/mods/ng-koreanchat-2.1.4.jar`, kind: "jar" }],
    patterns: ["^ng-koreanchat-.*\\.jar$"],
  },
  {
    id: "quietfishing",
    name: "낚시 음소거",
    sub: "NG-QuietFishing 1.0.0",
    desc: "낚시터에서 다른 사람의 낚시 소리는 안 들리고 내 소리만 들려요.",
    wiki: wiki("편의기능-낚시음소거"),
    downloads: [{ url: `${SITE}/mods/ng-quietfishing-1.0.0.jar`, kind: "jar" }],
    patterns: ["^ng-quietfishing-.*\\.jar$"],
  },
];

// 서버 리소스팩(접속하면 자동으로 받아지지만, 깨질 때 쓰는 수동용)
const NEOGUL_RESOURCEPACK = {
  name: "너굴마을 리소스팩",
  sub: "수동 적용용 · 약 30MB",
  desc: "접속하면 자동으로 받아져요. 글자나 아이템이 깨질 때만 설치하세요.",
  url: `${SITE}/mods/neogul-resourcepack.zip`,
  fileName: "neogul-resourcepack.zip",
};


// 망고's pick - 노바 클라이언트 "너굴마을" 프로필에 넣어 쓰던 모드 · 리소스팩 · 쉐이더 전부 (Modrinth)
// id 는 Modrinth 프로젝트 id (메타가 없던 Mod Menu · Chat Heads 는 slug)
// 너굴마을 전용 모드(ng-*), Simple Voice Chat, 노바 내장 모드는 위 NEOGUL_MODS 쪽에서 받아요.
const MANGO_PICKS = {
  mod: [
    { id: "4I1XuqiY", title: "[EMF] Entity Model Features", icon: "https://cdn.modrinth.com/data/4I1XuqiY/6e5bbd0d06b1741bfdab6c0cfab6de8fdaf0064c_96.webp" },
    { id: "BVzZfTc1", title: "[ETF] Entity Texture Features", icon: "https://cdn.modrinth.com/data/BVzZfTc1/af683d206d50b05258d865b0d6e4aa2f2cee12f2_96.webp" },
    { id: "kzwxhsjp", title: "Accurate Block Placement Reborn", icon: "https://cdn.modrinth.com/data/kzwxhsjp/d625b497fc032d684c9c9d1826ee04fbef9f37d9_96.webp" },
    { id: "lhGA9TYQ", title: "Architectury API", icon: "https://cdn.modrinth.com/data/lhGA9TYQ/05fe3a61c28faaccaec3533b92e1b321edde7bf6_96.webp" },
    { id: "OfKzpbRU", title: "BaguetteLib", icon: "https://cdn.modrinth.com/data/OfKzpbRU/d007c3afd229b8e796f41174ceacd7c8f0f436cc_96.webp" },
    { id: "Q2OqKxDG", title: "Better Advancements", icon: "https://cdn.modrinth.com/data/Q2OqKxDG/b1519a191e62135647f66394d526d179ab5b598d.png" },
    { id: "ONZm0H7Y", title: "Better Block Entities", icon: "https://cdn.modrinth.com/data/ONZm0H7Y/5ff4f3ad6948a0bf185f641c407878932bae3dcf.png" },
    { id: "chat-heads", title: "Chat Heads", icon: null },
    { id: "9s6osm5g", title: "Cloth Config API", icon: "https://cdn.modrinth.com/data/9s6osm5g/ed8a2316cbb6f4fc5f510e8e13a59a85cbbbff4d_96.webp" },
    { id: "VSNURh3q", title: "Concurrent Chunk Management Engine (Fabric)", icon: "https://cdn.modrinth.com/data/VSNURh3q/3c2ce471054466712a44c8758a03e03bb868f93b_96.webp" },
    { id: "lGffrQ3O", title: "Configurable", icon: "https://cdn.modrinth.com/data/lGffrQ3O/ba01416a5f946b64040cc6a48e3456e351e73762.png" },
    { id: "1IjD5062", title: "Continuity", icon: "https://cdn.modrinth.com/data/1IjD5062/icon.png" },
    { id: "xv94TkTM", title: "Controlling", icon: "https://cdn.modrinth.com/data/xv94TkTM/bdb6feb3d04ca37da4ed5aa73fef062a39d8b3e5_96.webp" },
    { id: "NNAgCjsB", title: "Entity Culling", icon: "https://cdn.modrinth.com/data/NNAgCjsB/7873452d6cede4daed12da3d7d8c193ab88b4fd6_96.webp" },
    { id: "OSQ8mw2r", title: "Explosive Enhancement", icon: "https://cdn.modrinth.com/data/OSQ8mw2r/88f44e9ed022061b1eb865996b2f98fe01937de6.png" },
    { id: "Ha28R6CL", title: "Fabric Language Kotlin", icon: "https://cdn.modrinth.com/data/Ha28R6CL/72c3d74aeb665e45aea93a945a01474cbce3b7da_96.webp" },
    { id: "uXXizFIs", title: "FerriteCore", icon: "https://cdn.modrinth.com/data/uXXizFIs/222a126f26f8f9ae1eb339f3b767677f18bff31f_96.webp" },
    { id: "ohNO6lps", title: "Forge Config API Port", icon: "https://cdn.modrinth.com/data/ohNO6lps/cb3b942cc18a66a0f35f802e004713f134e46cc2_96.webp" },
    { id: "8BmcQJ2H", title: "Geckolib", icon: "https://cdn.modrinth.com/data/8BmcQJ2H/012d1aadbc754995de66e8c149a56aa10b63fe05_96.webp" },
    { id: "5faXoLqX", title: "Iceberg", icon: "https://cdn.modrinth.com/data/5faXoLqX/88c9b9918841470dad995049244ef7a3cb2f34f5_96.webp" },
    { id: "5ZwdcRci", title: "ImmediatelyFast", icon: "https://cdn.modrinth.com/data/5ZwdcRci/e57b6b451425692ac17ad322d5e14bea686a383a_96.webp" },
    { id: "YL57xq9U", title: "Iris Shaders", icon: "https://cdn.modrinth.com/data/YL57xq9U/18d0e7f076d3d6ed5bedd472b853909aac5da202_96.webp" },
    { id: "cVNW5lr6", title: "Item Highlighter", icon: "https://cdn.modrinth.com/data/cVNW5lr6/5e15f8c53ea36ca5391cdd9bbdea33261fa4c18d_96.webp" },
    { id: "p8RJPJIC", title: "Ixeris", icon: "https://cdn.modrinth.com/data/p8RJPJIC/4ca312df105cb246a91f5b782bfd863930d8888f_96.webp" },
    { id: "gvQqBUqZ", title: "Lithium", icon: "https://cdn.modrinth.com/data/gvQqBUqZ/bcc8686c13af0143adf4285d741256af824f70b7_96.webp" },
    { id: "gPCdW0Wr", title: "Make Bubbles Pop", icon: "https://cdn.modrinth.com/data/gPCdW0Wr/4616c50230e3e716f02127a0e74f250470a07e85.png" },
    { id: "modmenu", title: "Mod Menu", icon: null },
    { id: "51shyZVL", title: "More Culling", icon: "https://cdn.modrinth.com/data/51shyZVL/c51b07193b56e952269ef50101d12aecba2b4747_96.webp" },
    { id: "1s5x833P", title: "Neruina - Ticking Entity Fixer", icon: "https://cdn.modrinth.com/data/1s5x833P/b7e3cf809f07d3cad88a60834c3e4e7248021744_96.webp" },
    { id: "MPCX6s5C", title: "Not Enough Animations", icon: "https://cdn.modrinth.com/data/MPCX6s5C/b97fd5f7a893165052408b747286d6eb38d57abb_96.webp" },
    { id: "nrikgvxm", title: "Particle Rain", icon: "https://cdn.modrinth.com/data/nrikgvxm/e637304d1bec07c39e833d810aa4bdbb9703bf95_96.webp" },
    { id: "pYFUU6cq", title: "Particular ✨ Reforged", icon: "https://cdn.modrinth.com/data/pYFUU6cq/152536579fe8e475149273b64cabdef764b3da9f_96.webp" },
    { id: "1OE8wbN0", title: "Prism", icon: "https://cdn.modrinth.com/data/1OE8wbN0/2fecc17cdc6036b648f0defc7c9a85a6733be435_96.webp" },
    { id: "Bh37bMuy", title: "Reese's Sodium Options", icon: "https://cdn.modrinth.com/data/Bh37bMuy/icon.png" },
    { id: "yXAvIk0x", title: "Scribble", icon: "https://cdn.modrinth.com/data/yXAvIk0x/cf63f0295c57f6f2f14c51d8e1075de19e9f4f76.png" },
    { id: "fuuu3xnx", title: "Searchables", icon: "https://cdn.modrinth.com/data/fuuu3xnx/206971d54b37b30a2e728b1c194f7f096963d05a_96.webp" },
    { id: "AANobbMI", title: "Sodium", icon: "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp" },
    { id: "PtjYWJkn", title: "Sodium Extra", icon: "https://cdn.modrinth.com/data/PtjYWJkn/0df4fb22a11e1dcb5e83cb0aadd275b571aca7a9_96.webp" },
    { id: "qyVF9oeo", title: "Sound Physics Remastered", icon: "https://cdn.modrinth.com/data/qyVF9oeo/798fbfae58ec95ad51f3e1d522b43227306c326c.png" },
    { id: "eXts2L7r", title: "Text Placeholder API", icon: "https://cdn.modrinth.com/data/eXts2L7r/e9c9990896e6422bffc5f73d2c41b8f077348f83.png" },
    { id: "dlNu0RQY", title: "Wakes", icon: "https://cdn.modrinth.com/data/dlNu0RQY/46be95a28f27da8a98e9721b6695703fcec2d7d8_96.webp" },
    { id: "1eAoo2KR", title: "YetAnotherConfigLib (YACL)", icon: "https://cdn.modrinth.com/data/1eAoo2KR/08c0cd32515e260f4bb20bbc0696510041523f9a_96.webp" },
  ],
  resourcepack: [
    { id: "50dA9Sha", title: "Fresh Animations", icon: "https://cdn.modrinth.com/data/50dA9Sha/3132c10e9e3c73fde9799720fd3da5561071708c_96.webp" },
    { id: "A32gwfe8", title: "Enchantment Outlines", icon: "https://cdn.modrinth.com/data/A32gwfe8/9f4bd3edfdb3df167c64757f66b828eba664a616_96.webp" },
    { id: "u4iPx1Dr", title: "Icon Fresh", icon: "https://cdn.modrinth.com/data/u4iPx1Dr/78fd3b6814105ce2f9e84049f3f9f11969e77729_96.webp" },
    { id: "UinPYBF7", title: "Enhanced Audio (Sound Pack)", icon: "https://cdn.modrinth.com/data/UinPYBF7/abae34e620e78b564e29b495ee15dee97a226ce1_96.webp" },
    { id: "oL18adaQ", title: "New Glowing Ores", icon: "https://cdn.modrinth.com/data/oL18adaQ/2bb2608c4f8c4801cbbdd3c60673b3c2228c5027.png" },
  ],
  shader: [
    { id: "HVnmMxH1", title: "Complementary Shaders - Reimagined", icon: "https://cdn.modrinth.com/data/HVnmMxH1/79cb7c8123bbc54945305b2ebad6b8881efdf5f8_96.webp" },
    { id: "R6NEzAwj", title: "Complementary Shaders - Unbound", icon: "https://cdn.modrinth.com/data/R6NEzAwj/c85ce4049aac76360d2cd24fd9a7003de01ef312_96.webp" },
    { id: "Q1vvjJYV", title: "BSL Shaders", icon: "https://cdn.modrinth.com/data/Q1vvjJYV/2a611a3cb434fb52fb81fa5dace13c5d8b67e55d_96.webp" },
  ],
};

module.exports = {
  MANGO_PICKS,
  SERVER,
  IMAGES,
  LINKS,
  CONTENTS,
  WIKI_SECTIONS,
  NEOGUL_MODS,
  NEOGUL_RESOURCEPACK,
};
