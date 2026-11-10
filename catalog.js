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

module.exports = {
  SERVER,
  IMAGES,
  LINKS,
  CONTENTS,
  WIKI_SECTIONS,
  NEOGUL_MODS,
  NEOGUL_RESOURCEPACK,
};
