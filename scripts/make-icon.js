// 설치 파일을 만들기 직전에(npm run dist:win) 자동으로 실행돼요.
// 너굴마을 로고(사이트 탭 아이콘과 같은 그림)를 받아서 build/icon.png 로 저장 →
// 앱 아이콘 · 바탕화면 바로가기 · 설치 프로그램 아이콘이 전부 이 그림이 돼요.
// (윈도우용 .ico 는 electron-builder 가 이 png 로 알아서 만들어요)
// 인터넷이 안 되면 이미 있는 build/icon.png 를 그대로 써요.
const https = require("https");
const fs = require("fs");
const path = require("path");

const SRC = process.env.NUGUL_ICON_URL || "https://mcng.kr/assets/img/logo.png";
const OUT = path.join(__dirname, "..", "build", "icon.png");

function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Nugulient-build" }, timeout: 20000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
          res.resume();
          return resolve(get(new URL(res.headers.location, url).toString(), hops + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("timeout", function () { this.destroy(new Error("시간 초과")); })
      .on("error", reject);
  });
}

(async () => {
  try {
    const buf = await get(SRC);
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buf.slice(0, 8).equals(PNG)) throw new Error("PNG 파일이 아니에요");
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (w < 256 || h < 256) throw new Error(`그림이 너무 작아요 (${w}x${h}, 256x256 이상 필요)`);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, buf);
    console.log(`[아이콘] 너굴마을 로고로 앱 아이콘을 만들었어요 (${w}x${h})`);
  } catch (err) {
    if (fs.existsSync(OUT)) console.warn(`[아이콘] 로고를 받지 못해서 지금 있는 build/icon.png 를 써요: ${err.message}`);
    else { console.error(`[아이콘] 로고를 받지 못했어요: ${err.message}`); process.exit(1); }
  }
})();
