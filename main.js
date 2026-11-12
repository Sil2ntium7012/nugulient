// ─────────────────────────────────────────────────────────────────────────────
// 너굴라이언트 - 메인 프로세스
// Nova Client 의 로그인(msmc) · 자바/Fabric 준비 · 실행(mclc) · servers.dat 코드를 가져와
// 너굴마을(mcng.kr, 26.1.2 Fabric) 하나만 쓰도록 줄인 버전.
// 계정 서버 같은 건 없고, 모든 데이터는 이 PC 의 %APPDATA%\Nugulient 에만 저장됩니다.
// ─────────────────────────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, powerMonitor, safeStorage, nativeImage } = require("electron");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const net = require("net");
const dns = require("dns").promises;
const fetch = require("node-fetch");
const AdmZip = require("adm-zip");
const extractZip = require("extract-zip");
const tar = require("tar");
const Store = require("electron-store");
const { Auth, tokenUtils } = require("msmc");
const { Client } = require("minecraft-launcher-core");
const MclcHandler = require("minecraft-launcher-core/components/handler");

const {
  SERVER,
  IMAGES,
  LINKS,
  CONTENTS,
  WIKI_SECTIONS,
  NEOGUL_MODS,
  NEOGUL_RESOURCEPACK,
  MANGO_PICKS,
} = require("./catalog");
const COSMETICS = require("./src/cosmetics");
const { autoUpdater } = require("electron-updater");

const APP_VERSION = require("./package.json").version;
const USER_AGENT = `Sil2ntium7012/nugulient/${APP_VERSION}`;
const MODRINTH = "https://api.modrinth.com/v2";

// ─── 폴더 ────────────────────────────────────────────────────────────────────
// 개발 중(npm start)에는 -Dev 폴더를 써서 설치본과 섞이지 않게 함 (노바클과 같은 방식)
const ROOT = path.join(app.getPath("appData"), app.isPackaged ? "Nugulient" : "Nugulient-Dev");
const GAME_DIR = path.join(ROOT, "minecraft");
const DIRS = {
  mod: path.join(GAME_DIR, "mods"),
  resourcepack: path.join(GAME_DIR, "resourcepacks"),
  shader: path.join(GAME_DIR, "shaderpacks"),
};
for (const d of [ROOT, GAME_DIR, ...Object.values(DIRS)]) fs.mkdirSync(d, { recursive: true });

const store = new Store({ cwd: ROOT });

// ─── 암호화 저장소 (계정 · 보관함 · 뽑기 기록) ─────────────────────────────────
// config.json 은 누구나 메모장으로 열어 고칠 수 있어서, 고치면 안 되는 것만 secure.dat 에
// AES-256-GCM 으로 암호화해서 따로 저장한다.
//  - 열쇠는 설치할 때 무작위로 만들고, 윈도우 계정 보호(DPAPI, Electron safeStorage)로 감싸서
//    보관한다 → 다른 PC 로 파일을 복사해 가도 안 열리고, 열쇠 없이는 내용을 볼 수도 없다.
//  - GCM 은 한 글자라도 바뀌면 열리지 않는다 → 고친 흔적이 있으면 보관함을 초기화한다.
const SECURE_FILE = path.join(ROOT, "secure.dat");
const SECURE_AAD = Buffer.from("nugulient-secure-v1");
const SECURE_KEYS = ["account", "collection", "skipNova"]; // 예전엔 config.json 에 평문으로 있던 것들
let secureKey = null;
let secureData = null;
let secureTampered = false;

function getSecureKey() {
  if (secureKey) return secureKey;
  // 앱 안에 박힌 값과 섞어서, 감싼 열쇠를 꺼내더라도 그것만으로는 바로 못 쓰게 함
  const pepper = (raw) => crypto.createHmac("sha256", "nugulient::secure::pepper::v1").update(raw).digest();
  const fallback = () => pepper(Buffer.from(`${os.hostname()}|${os.userInfo().username}|${app.getPath("appData")}`));
  const canProtect = (() => { try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; } })();
  const blob = store.get("secureKey");
  if (blob?.dpapi && canProtect) {
    try { secureKey = pepper(Buffer.from(safeStorage.decryptString(Buffer.from(blob.data, "base64")), "base64")); }
    catch (err) { log("[암호화] 열쇠를 열지 못함: " + (err?.message || err)); }
  } else if (blob && !blob.dpapi) {
    secureKey = fallback();
  }
  if (!secureKey) {
    if (canProtect) {
      const raw = crypto.randomBytes(32);
      store.set("secureKey", { dpapi: true, data: safeStorage.encryptString(raw.toString("base64")).toString("base64") });
      secureKey = pepper(raw);
    } else {
      store.set("secureKey", { dpapi: false });
      secureKey = fallback();
    }
  }
  return secureKey;
}

function loadSecure() {
  if (secureData) return secureData;
  secureData = {};
  if (fs.existsSync(SECURE_FILE)) {
    try {
      const box = JSON.parse(fs.readFileSync(SECURE_FILE, "utf8"));
      const d = crypto.createDecipheriv("aes-256-gcm", getSecureKey(), Buffer.from(box.iv, "base64"));
      d.setAAD(SECURE_AAD);
      d.setAuthTag(Buffer.from(box.tag, "base64"));
      const plain = Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]);
      secureData = JSON.parse(plain.toString("utf8"));
    } catch (err) {
      // 고쳤거나, 다른 PC 에서 가져왔거나, 열쇠가 바뀜 → 믿을 수 없으니 버리고 새로 시작
      secureTampered = true;
      log("[암호화] secure.dat 을 열지 못해 초기화함 (변조 또는 다른 PC 파일): " + (err?.message || err));
      try { fs.renameSync(SECURE_FILE, SECURE_FILE + `.broken-${Date.now()}`); } catch (_) {}
      secureData = {};
    }
  }
  // 예전 버전이 config.json 에 평문으로 남긴 값은 한 번만 옮기고 지움
  let moved = false;
  for (const k of SECURE_KEYS) {
    if (store.has(k)) {
      if (secureData[k] === undefined && !secureTampered) secureData[k] = store.get(k);
      store.delete(k);
      moved = true;
    }
  }
  if (moved) saveSecure();
  return secureData;
}

function saveSecure() {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", getSecureKey(), iv);
  c.setAAD(SECURE_AAD);
  const data = Buffer.concat([c.update(JSON.stringify(secureData || {}), "utf8"), c.final()]);
  const box = { v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
  const tmp = SECURE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(box));
  fs.renameSync(tmp, SECURE_FILE);
}

const secure = {
  get: (k) => loadSecure()[k],
  set: (k, v) => { loadSecure()[k] = v; saveSecure(); },
  delete: (k) => { const d = loadSecure(); if (k in d) { delete d[k]; saveSecure(); } },
};
const LOG_PATH = path.join(ROOT, "launcher.log");

function log(msg) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}
process.on("uncaughtException", (e) => log("[예외] " + (e?.stack || e)));
process.on("unhandledRejection", (e) => log("[거부] " + (e?.stack || e)));

const DEFAULT_SETTINGS = {
  memoryGB: 4,
  width: 1280,
  height: 720,
  fullscreen: false,
  hideOnLaunch: true,
  baseMode: "gray", // "gray" | "white"
  font: "suit",
  fontSize: 14,
};
function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(store.get("settings") || {}) };
}

// ─── mclc 동시 다운로드 제한 (노바클 24-181차 그대로) ─────────────────────────
// 에셋 수천 개를 한꺼번에 열다가 윈도우 파일 핸들 한도(EMFILE)에 걸려 죽는 걸 막음
const MCLC_MAX_PARALLEL = 12;
let mclcActive = 0;
const mclcWaiting = [];
const mclcAcquire = () =>
  mclcActive < MCLC_MAX_PARALLEL ? (mclcActive++, Promise.resolve()) : new Promise((r) => mclcWaiting.push(r));
function mclcRelease() {
  const next = mclcWaiting.shift();
  if (next) next();
  else mclcActive--;
}
const origDownloadAsync = MclcHandler.prototype.downloadAsync;
MclcHandler.prototype.downloadAsync = async function (url, dir, name, retry, type) {
  if (retry !== true) return origDownloadAsync.call(this, url, dir, name, retry, type);
  await mclcAcquire();
  try {
    return await origDownloadAsync.call(this, url, dir, name, retry, type);
  } finally {
    mclcRelease();
  }
};
if (typeof MclcHandler.prototype.checkSum === "function") {
  const origCheckSum = MclcHandler.prototype.checkSum;
  MclcHandler.prototype.checkSum = async function (...args) {
    await mclcAcquire();
    try {
      return await origCheckSum.apply(this, args);
    } finally {
      mclcRelease();
    }
  };
}

// ─── 창 ──────────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    resizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: "#15110d",
    show: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  // 화면 안의 링크는 전부 외부 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) {
      e.preventDefault();
      openExternalSafe(url);
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    createWindow();
    setupAutoUpdate();
    startCookSchedule();
    startSiteInfoSchedule();
  });
  app.on("window-all-closed", () => app.quit());
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function progress(stage, pct, text) {
  send("launch:progress", { stage, pct: Math.max(0, Math.min(100, Math.round(pct))), text });
}

// 외부 링크는 아는 주소만 연다
const SAFE_HOSTS = ["mcng.kr", "github.com", "discord.com", "discord.gg", "minelist.kr", "modrinth.com", "namemc.com", "www.minecraft.net", "minecraft.net"];
function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const ok = SAFE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
    if (!ok) return false;
    shell.openExternal(u.toString());
    return true;
  } catch (_) {
    return false;
  }
}

ipcMain.handle("app:info", () => ({
  version: APP_VERSION,
  server: SERVER,
  images: IMAGES,
  links: LINKS,
  contents: CONTENTS,
  wikiSections: WIKI_SECTIONS,
  gameDir: GAME_DIR,
}));
ipcMain.on("win:minimize", () => mainWindow?.minimize());
ipcMain.on("win:close", () => mainWindow?.close());
ipcMain.handle("open:external", (_e, url) => openExternalSafe(url));
ipcMain.handle("open:folder", (_e, which) => {
  const extra = { root: GAME_DIR, screenshots: path.join(GAME_DIR, "screenshots"), logs: path.join(GAME_DIR, "logs"), launcher: ROOT };
  const target = extra[which] || DIRS[which] || GAME_DIR;
  fs.mkdirSync(target, { recursive: true });
  return shell.openPath(target);
});

// ─── 기능: 스크린샷 · 리소스팩 깨짐 해결 ─────────────────────────────────────
ipcMain.handle("tools:screenshots", async () => {
  const dir = path.join(GAME_DIR, "screenshots");
  const names = (await fsp.readdir(dir).catch(() => [])).filter((n) => /\.png$/i.test(n));
  const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await fsp.stat(path.join(dir, n)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
  withTime.sort((a, b) => b.t - a.t);
  return withTime.slice(0, 24).map(({ n, t }) => {
    let thumb = null;
    try { thumb = nativeImage.createFromPath(path.join(dir, n)).resize({ width: 320 }).toDataURL(); } catch (_) {}
    return { name: n, at: t, thumb };
  });
});
ipcMain.handle("tools:open-screenshot", (_e, name) => shell.openPath(path.join(GAME_DIR, "screenshots", path.basename(String(name)))));
// 위키 안내대로: downloads 폴더(서버 리소스팩이 받아지는 곳)를 지우면 다음 접속 때 새로 받음
ipcMain.handle("tools:clear-rp-cache", async () => {
  if (gameProcess) return { ok: false, error: "게임을 끈 다음에 해 주세요." };
  const dir = path.join(GAME_DIR, "downloads");
  if (!fs.existsSync(dir)) return { ok: true, empty: true };
  await fsp.rm(dir, { recursive: true, force: true });
  log("[기능] 서버 리소스팩 캐시(downloads) 삭제");
  return { ok: true };
});
ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:set", (_e, partial) => {
  const s = { ...getSettings(), ...(partial || {}) };
  s.memoryGB = Math.max(2, Math.min(32, Number(s.memoryGB) || 4));
  s.width = Math.max(640, Math.min(7680, Number(s.width) || 1280));
  s.height = Math.max(480, Math.min(4320, Number(s.height) || 720));
  s.fullscreen = !!s.fullscreen;
  s.hideOnLaunch = !!s.hideOnLaunch;
  s.baseMode = s.baseMode === "white" ? "white" : "gray";
  s.font = COSMETICS.FONTS[s.font] ? s.font : "suit";
  s.fontSize = [13, 14, 15, 16].includes(Number(s.fontSize)) ? Number(s.fontSize) : 14;
  store.set("settings", s);
  return s;
});
ipcMain.handle("system:memory", () => Math.floor(require("os").totalmem() / 1024 ** 3));

// ─── 계정 (마이크로소프트 로그인, 이 PC 에만 저장) ─────────────────────────────
// 자동 로그인 순서
//   1) 이 클라이언트에 저장된 계정
//   2) 노바 클라이언트에 로그인한 기록 (%APPDATA%\NovaClient\config.json, 읽기만 함)
//   3) 둘 다 없으면 PLAY 누를 때 마이크로소프트 로그인 창
let cachedAuth = null; // mclc 에 넘길 인증 정보 (메모리에만)

function profileFrom(mclcAuth, fallbackUuid) {
  return {
    name: mclcAuth?.profile?.name || mclcAuth?.name || "플레이어",
    uuid: String(mclcAuth?.profile?.id || mclcAuth?.uuid || fallbackUuid || "").replace(/-/g, ""),
  };
}

async function restoreFromSavedToken(savedToken, fallbackUuid) {
  const auth = new Auth("select_account");
  let mc = await tokenUtils.fromMclcToken(auth, savedToken);
  if (!mc) throw new Error("저장된 로그인 정보를 갱신할 수 없어요.");
  mc = await mc.refresh(false); // 만료됐을 때만 실제로 갱신
  const mclcAuth = mc.mclc();
  return { mclcAuth, refreshable: mc.mclc(true), profile: profileFrom(mclcAuth, fallbackUuid) };
}

function saveAccount(profile, refreshable, source) {
  secure.set("account", { ...profile, savedToken: refreshable, source, savedAt: Date.now() });
}

// 노바 클라이언트의 저장 파일에서 활성 계정을 찾아 돌려줌 (파일은 절대 건드리지 않음)
function readNovaAccount() {
  const candidates = [path.join(app.getPath("appData"), "NovaClient", "config.json")];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      const accounts = data.accounts || {};
      const active = data.active_uuid && accounts[data.active_uuid];
      const acc = active || Object.values(accounts)[0];
      if (acc?.savedToken) return { uuid: acc.uuid, name: acc.name, savedToken: acc.savedToken };
    } catch (err) {
      log("[노바 계정] 읽기 실패: " + (err?.message || err));
    }
  }
  return null;
}

ipcMain.handle("auth:init", async () => {
  // 1) 내 저장 계정
  const mine = secure.get("account");
  if (mine?.savedToken) {
    try {
      const r = await restoreFromSavedToken(mine.savedToken, mine.uuid);
      cachedAuth = r.mclcAuth;
      saveAccount(r.profile, r.refreshable, mine.source || "microsoft");
      log("[자동 로그인] 저장된 계정: " + r.profile.name);
      return { ok: true, profile: r.profile, source: "saved" };
    } catch (err) {
      log("[자동 로그인] 저장된 계정 갱신 실패: " + loginErrorCode(err));
    }
  }
  // 2) 노바 클라이언트 로그인 기록 (여기서 로그아웃한 적이 있으면 다시 가져오지 않음)
  const nova = secure.get("skipNova") ? null : readNovaAccount();
  if (nova) {
    try {
      const r = await restoreFromSavedToken(nova.savedToken, nova.uuid);
      cachedAuth = r.mclcAuth;
      saveAccount(r.profile, r.refreshable, "nova");
      log("[자동 로그인] 노바 클라이언트 계정: " + r.profile.name);
      return { ok: true, profile: r.profile, source: "nova" };
    } catch (err) {
      log("[자동 로그인] 노바 계정 갱신 실패: " + loginErrorCode(err));
    }
  }
  // 갱신은 실패했어도 이름은 보여줄 수 있게
  return { ok: false, lastName: mine?.name || null };
});

async function checkOwnership(accessToken) {
  try {
    const res = await fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) return { ok: false, error: "마인크래프트 자바 에디션이 없는 계정이에요." };
    return { ok: true };
  } catch (_) {
    return { ok: true }; // 네트워크 문제면 막지 않음
  }
}

ipcMain.handle("auth:login", async () => {
  try {
    const auth = new Auth("select_account");
    const xbox = await auth.launch("electron", { width: 500, height: 650, resizable: false });
    const token = await xbox.getMinecraft();
    const mclcAuth = token.mclc();
    const own = await checkOwnership(mclcAuth?.access_token);
    if (!own.ok) return own;
    cachedAuth = mclcAuth;
    const profile = profileFrom(mclcAuth);
    saveAccount(profile, token.mclc(true), "microsoft");
    secure.delete("skipNova");
    log("[로그인] " + profile.name);
    return { ok: true, profile };
  } catch (err) {
    const code = loginErrorCode(err);
    log("[로그인] 실패: " + code + (err?.response?.status ? ` (HTTP ${err.response.status})` : "") + (err?.stack ? " | " + String(err.stack).split("\n")[0] : ""));
    if (/cancel|error\.gui\.closed/i.test(code)) return { ok: false, cancelled: true };
    return { ok: false, error: loginErrorText(code) };
  }
});

// msmc 는 오류를 "error.xxx" 문자열이나 { ts, response } 객체로 던짐
function loginErrorCode(err) {
  if (typeof err === "string") return err;
  if (err?.ts) return String(err.ts);
  if (err?.name && String(err.name).startsWith("error.")) return String(err.name);
  return String(err?.message || err?.code || err || "unknown");
}

function loginErrorText(code) {
  const c = String(code);
  if (c.includes("xsts.userNotFound")) return "이 마이크로소프트 계정에 Xbox 프로필이 없어요. xbox.com 에 한 번 로그인해서 프로필을 만든 뒤 다시 해 주세요.";
  if (c.includes("xsts.child")) return "만 18세 미만 계정은 보호자가 Xbox 가족 설정에서 허락해 줘야 로그인할 수 있어요.";
  if (c.includes("xsts.bannedCountry")) return "Xbox Live 를 쓸 수 없는 지역의 계정이에요.";
  if (c.includes("minecraft.entitlements")) return "이 계정은 마인크래프트 자바 에디션을 갖고 있지 않아요. (게임패스면 공식 런처를 한 번 실행해 주세요)";
  if (c.includes("minecraft.profile")) return "마인크래프트 프로필(닉네임)이 아직 없어요. 공식 런처에서 닉네임을 먼저 만들어 주세요.";
  if (c.includes("error.auth.microsoft")) return "마이크로소프트 로그인이 만료됐어요. 다시 로그인해 주세요.";
  if (c.includes("error.auth.xboxLive") || c.includes("error.auth.xsts")) return "Xbox 서버에 로그인하지 못했어요. 잠시 뒤 다시 해 주세요.";
  if (c.includes("error.auth.minecraft")) return "마인크래프트 서버에 로그인하지 못했어요. 잠시 뒤 다시 해 주세요.";
  if (c.includes("error.state") || c.includes("error.gui")) return "로그인 창을 열지 못했어요. 런처를 껐다 켜고 다시 해 주세요.";
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|network|fetch failed/i.test(c)) return "인터넷 연결을 확인해 주세요. (마이크로소프트 서버에 닿지 않았어요)";
  return "로그인하지 못했어요. 다시 시도해 주세요. (" + c.slice(0, 60) + ")";
}

ipcMain.handle("auth:logout", () => {
  cachedAuth = null;
  secure.delete("account");
  // 노바 계정을 다시 자동으로 가져오지 않게 표시 (다시 로그인하면 풀림)
  secure.set("skipNova", true);
  return { ok: true };
});

function accessToken() {
  return cachedAuth?.access_token || cachedAuth?.accessToken || null;
}

// ─── 서버 상태 (마인크래프트 서버 목록 핑, 외부 API 없이 직접) ─────────────────
function varint(n) {
  const out = [];
  n = n >>> 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}
function readVarint(buf, offset) {
  let num = 0, shift = 0, pos = offset;
  for (;;) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    num |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: num, size: pos - offset };
    shift += 7;
    if (shift > 35) throw new Error("varint 너무 김");
  }
}
function packet(id, payload) {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
}

async function resolveServer(host, port) {
  try {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv?.length) return { host: srv[0].name, port: srv[0].port };
  } catch (_) {}
  return { host, port };
}

async function pingServer() {
  const target = await resolveServer(SERVER.host, SERVER.port);
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.createConnection({ host: target.host, port: target.port });
    let buf = Buffer.alloc(0);
    const done = (result) => {
      sock.destroy();
      resolve(result);
    };
    sock.setTimeout(6000, () => done({ online: false }));
    sock.on("error", () => done({ online: false }));
    sock.on("connect", () => {
      const hostBuf = Buffer.from(SERVER.host, "utf8");
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(SERVER.port);
      const handshake = Buffer.concat([varint(0xffffffff), varint(hostBuf.length), hostBuf, portBuf, varint(1)]);
      sock.write(packet(0x00, handshake));
      sock.write(packet(0x00, Buffer.alloc(0)));
    });
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len.size + len.value) return;
        let o = len.size;
        const id = readVarint(buf, o);
        o += id.size;
        const sLen = readVarint(buf, o);
        o += sLen.size;
        const json = JSON.parse(buf.toString("utf8", o, o + sLen.value));
        done({
          online: true,
          players: json.players?.online ?? 0,
          max: json.players?.max ?? 0,
          version: json.version?.name || SERVER.mcVersion,
          latency: Date.now() - started,
        });
      } catch (err) {
        done({ online: false });
      }
    });
  });
}
ipcMain.handle("server:status", () => pingServer());

// ─── 다운로드 공통 ───────────────────────────────────────────────────────────
async function download(url, dest, onProgress, headers = {}) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": USER_AGENT, ...headers } });
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  let got = 0;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + ".part";
  const out = fs.createWriteStream(tmp);
  await new Promise((resolve, reject) => {
    res.body.on("data", (c) => {
      got += c.length;
      if (total && onProgress) onProgress((got / total) * 100);
    });
    res.body.on("error", reject);
    out.on("error", reject);
    out.on("finish", resolve);
    res.body.pipe(out);
  }).catch(async (err) => {
    out.close();
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  });
  await fsp.rename(tmp, dest);
  return dest;
}

async function downloadBuffer(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
  return res.buffer();
}

// ─── 자바 25 (26.x 는 자바 25 필요) ───────────────────────────────────────────
const JAVA_VERSION = 25;
function findFile(dir, names) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, names);
      if (found) return found;
    } else if (names.includes(entry.name.toLowerCase())) {
      return full;
    }
  }
  return null;
}
function javaIn(dir) {
  return process.platform === "win32" ? findFile(dir, ["javaw.exe"]) || findFile(dir, ["java.exe"]) : findFile(dir, ["java"]);
}
async function ensureJava() {
  const own = path.join(ROOT, "runtime", `jre-${JAVA_VERSION}`);
  const existing = javaIn(own);
  if (existing) return existing;
  // 노바 클라이언트가 이미 받아둔 자바가 있으면 그대로 씀 (다시 안 받음)
  const novaJava = javaIn(path.join(app.getPath("appData"), "NovaClient", "runtime", `jre-${JAVA_VERSION}`));
  if (novaJava) return novaJava;

  const osKey = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x64";
  const ext = osKey === "windows" ? "zip" : "tar.gz";
  const url = `https://api.adoptium.net/v3/binary/latest/${JAVA_VERSION}/ga/${osKey}/${arch}/jre/hotspot/normal/eclipse`;
  await fsp.mkdir(own, { recursive: true });
  const archive = path.join(own, `jre.${ext}`);
  await download(url, archive, (p) => progress("java", p, `자바 ${JAVA_VERSION} 받는 중`));
  progress("java", 100, "자바 압축 푸는 중");
  if (ext === "zip") await extractZip(archive, { dir: own });
  else await tar.x({ file: archive, cwd: own });
  await fsp.unlink(archive).catch(() => {});
  const bin = javaIn(own);
  if (!bin) throw new Error("자바를 설치하지 못했어요.");
  if (process.platform !== "win32") fs.chmodSync(bin, 0o755);
  return bin;
}

// ─── Fabric ──────────────────────────────────────────────────────────────────
async function ensureFabric() {
  const cached = store.get("fabricVersionId");
  if (cached && fs.existsSync(path.join(GAME_DIR, "versions", cached, `${cached}.json`))) {
    // 새 로더가 나왔는지 가끔만 확인 (실패하면 있는 걸로 실행)
    const lastCheck = store.get("fabricCheckedAt") || 0;
    if (Date.now() - lastCheck < 24 * 3600 * 1000) return cached;
  }
  try {
    progress("fabric", 20, "Fabric 로더 확인 중");
    const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${SERVER.mcVersion}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error("Fabric 정보를 받지 못했어요.");
    const loaders = await res.json();
    const pick = loaders.find((l) => l.loader.stable) || loaders[0];
    if (!pick) throw new Error(`${SERVER.mcVersion} 용 Fabric 로더가 없어요.`);
    const id = `fabric-loader-${pick.loader.version}-${SERVER.mcVersion}`;
    const jsonPath = path.join(GAME_DIR, "versions", id, `${id}.json`);
    if (!fs.existsSync(jsonPath)) {
      progress("fabric", 60, "Fabric 프로필 받는 중");
      const pr = await fetch(
        `https://meta.fabricmc.net/v2/versions/loader/${SERVER.mcVersion}/${pick.loader.version}/profile/json`,
        { headers: { "User-Agent": USER_AGENT } }
      );
      if (!pr.ok) throw new Error("Fabric 프로필을 받지 못했어요.");
      await fsp.mkdir(path.dirname(jsonPath), { recursive: true });
      await fsp.writeFile(jsonPath, await pr.text(), "utf-8");
    }
    store.set("fabricVersionId", id);
    store.set("fabricCheckedAt", Date.now());
    progress("fabric", 100, "Fabric 준비 완료");
    return id;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// ─── servers.dat (멀티플레이 목록에 너굴마을 넣기) - 노바클 NBT 코드 그대로 ─────
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

function nbtRead(buf) {
  let o = 0;
  const u1 = () => buf.readUInt8(o++);
  const i4 = () => { const v = buf.readInt32BE(o); o += 4; return v; };
  const str = () => { const n = buf.readUInt16BE(o); o += 2; const s = buf.toString("utf8", o, o + n); o += n; return s; };
  const payload = (t) => {
    switch (t) {
      case T.BYTE: return buf.readInt8(o++);
      case T.SHORT: { const v = buf.readInt16BE(o); o += 2; return v; }
      case T.INT: return i4();
      case T.LONG: { const v = buf.readBigInt64BE(o); o += 8; return v; }
      case T.FLOAT: { const v = buf.readFloatBE(o); o += 4; return v; }
      case T.DOUBLE: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case T.BYTE_ARRAY: { const n = i4(); const v = buf.slice(o, o + n); o += n; return v; }
      case T.STRING: return str();
      case T.LIST: { const et = u1(); const n = i4(); const items = []; for (let i = 0; i < n; i++) items.push(payload(et)); return { __list: true, type: et, items }; }
      case T.COMPOUND: { const entries = []; for (;;) { const tt = u1(); if (tt === T.END) break; const name = str(); entries.push({ type: tt, name, value: payload(tt) }); } return { __compound: true, entries }; }
      case T.INT_ARRAY: { const n = i4(); const a = []; for (let i = 0; i < n; i++) a.push(i4()); return { __intArray: true, items: a }; }
      case T.LONG_ARRAY: { const n = i4(); const a = []; for (let i = 0; i < n; i++) { a.push(buf.readBigInt64BE(o)); o += 8; } return { __longArray: true, items: a }; }
      default: throw new Error("알 수 없는 NBT 태그: " + t);
    }
  };
  if (u1() !== T.COMPOUND) throw new Error("servers.dat 형식이 아니에요");
  const name = str();
  return { name, root: payload(T.COMPOUND) };
}

function nbtWrite(doc) {
  const parts = [];
  const u1 = (v) => { const b = Buffer.alloc(1); b.writeUInt8(v & 0xff); parts.push(b); };
  const i4 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); parts.push(b); };
  const str = (s) => { const sb = Buffer.from(String(s), "utf8"); const b = Buffer.alloc(2); b.writeUInt16BE(sb.length); parts.push(b, sb); };
  const payload = (t, v) => {
    switch (t) {
      case T.BYTE: { const b = Buffer.alloc(1); b.writeInt8(v); parts.push(b); return; }
      case T.SHORT: { const b = Buffer.alloc(2); b.writeInt16BE(v); parts.push(b); return; }
      case T.INT: return i4(v);
      case T.LONG: { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v)); parts.push(b); return; }
      case T.FLOAT: { const b = Buffer.alloc(4); b.writeFloatBE(v); parts.push(b); return; }
      case T.DOUBLE: { const b = Buffer.alloc(8); b.writeDoubleBE(v); parts.push(b); return; }
      case T.BYTE_ARRAY: { i4(v.length); parts.push(Buffer.from(v)); return; }
      case T.STRING: return str(v);
      case T.LIST: { u1(v.type); i4(v.items.length); for (const it of v.items) payload(v.type, it); return; }
      case T.COMPOUND: { for (const e of v.entries) { u1(e.type); str(e.name); payload(e.type, e.value); } u1(T.END); return; }
      case T.INT_ARRAY: { i4(v.items.length); for (const n of v.items) i4(n); return; }
      case T.LONG_ARRAY: { i4(v.items.length); for (const n of v.items) { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(n)); parts.push(b); } return; }
      default: throw new Error("알 수 없는 NBT 태그: " + t);
    }
  };
  u1(T.COMPOUND); str(doc.name || ""); payload(T.COMPOUND, doc.root);
  return Buffer.concat(parts);
}
const nbtFind = (c, name) => c.entries.find((e) => e.name === name) || null;
function nbtSet(c, type, name, value) {
  const e = nbtFind(c, name);
  if (e) { e.type = type; e.value = value; } else c.entries.push({ type, name, value });
}

// 너굴마을을 멀티 목록 "맨 위"에 두고, 리소스팩은 묻지 않고 사용으로 고정
function ensureServerInList() {
  const datPath = path.join(GAME_DIR, "servers.dat");
  try {
    let doc;
    try {
      let raw = fs.readFileSync(datPath);
      if (raw.length > 1 && raw[0] === 0x1f && raw[1] === 0x8b) raw = require("zlib").gunzipSync(raw);
      doc = nbtRead(raw);
    } catch (_) {
      doc = { name: "", root: { __compound: true, entries: [] } };
    }
    let servers = nbtFind(doc.root, "servers");
    if (!servers || !servers.value?.__list) {
      servers = { type: T.LIST, name: "servers", value: { __list: true, type: T.COMPOUND, items: [] } };
      doc.root.entries.push(servers);
    }
    if (servers.value.items.length === 0) servers.value.type = T.COMPOUND;
    const host = SERVER.host.toLowerCase();
    const isOurs = (c) => {
      const ip = c?.__compound ? nbtFind(c, "ip") : null;
      const v = String(ip?.value || "").trim().toLowerCase();
      return v === host || v === `${host}:25565` || v === `${host}:${SERVER.port}`;
    };
    let entry = servers.value.items.find(isOurs);
    servers.value.items = servers.value.items.filter((c) => !isOurs(c));
    if (!entry) entry = { __compound: true, entries: [] };
    nbtSet(entry, T.STRING, "name", SERVER.name);
    nbtSet(entry, T.STRING, "ip", SERVER.host);
    nbtSet(entry, T.BYTE, "acceptTextures", 1);
    servers.value.items.unshift(entry);
    fs.writeFileSync(datPath, nbtWrite(doc));
  } catch (err) {
    log("[servers.dat] 기록 실패(무시): " + (err?.message || err));
  }
}

// ─── 실행 ────────────────────────────────────────────────────────────────────
let gameProcess = null;
let launching = false;

ipcMain.handle("launch:status", () => ({ running: !!gameProcess, launching }));

ipcMain.handle("launch:start", async () => {
  if (gameProcess || launching) return { ok: false, error: "이미 실행 중이에요." };
  if (!cachedAuth) return { ok: false, needLogin: true };
  launching = true;
  try {
    // 실행 직전에 토큰을 한 번 더 갱신 (켜둔 채로 오래 지났을 때 대비)
    const acc = secure.get("account");
    if (acc?.savedToken) {
      try {
        const r = await restoreFromSavedToken(acc.savedToken, acc.uuid);
        cachedAuth = r.mclcAuth;
        saveAccount(r.profile, r.refreshable, acc.source);
      } catch (err) {
        log("[실행] 토큰 갱신 실패: " + loginErrorCode(err));
      }
    }

    progress("java", 0, "자바 확인 중");
    const javaPath = await ensureJava();
    const fabricId = await ensureFabric();
    ensureServerInList();
    // 내 클라이언트 모드(Luna's Light) · Fabric API 를 항상 넣어 둠
    await prepareBuiltinMods();

    const s = getSettings();
    const launcher = new Client();
    const opts = {
      authorization: cachedAuth,
      root: GAME_DIR,
      version: { number: SERVER.mcVersion, type: "release", custom: fabricId },
      memory: { max: `${s.memoryGB}G`, min: "1G" },
      javaPath,
      window: { width: s.width, height: s.height, fullscreen: s.fullscreen },
      // 플레이는 첫 실행부터 무조건 너굴마을로 바로 접속
      quickPlay: { type: "multiplayer", identifier: `${SERVER.host}:${SERVER.port}` },
    };
    await importOwnMinecraftOptions();
    await applyFirstRunOptions();
    await writeModLaunchFile(false);

    let lastPct = 0;
    launcher.on("progress", (e) => {
      if (!e?.total) return;
      const pct = (e.task / e.total) * 100;
      const label = { assets: "에셋", natives: "네이티브", classes: "라이브러리", "classes-custom": "Fabric 라이브러리", "classes-maven-custom": "Fabric 라이브러리" }[e.type] || "게임 파일";
      if (Math.abs(pct - lastPct) >= 1 || pct >= 100) {
        lastPct = pct;
        progress("game", pct, `${label} 받는 중`);
      }
    });
    launcher.on("data", (line) => {
      const text = String(line).trimEnd();
      log(text);
      watchRecommend(text);
    });
    launcher.on("debug", (line) => log("[debug] " + String(line).trimEnd()));
    launcher.on("close", (code) => {
      log("게임 종료, 코드 " + code);
      gameProcess = null;
      if (pendingAutoInstall && updateState.status === "ready") {
        pendingAutoInstall = false;
        autoInstallSoon(updateState.version);
      }
      else checkUpdateNow(true);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
      send("launch:closed", { code });
    });

    progress("game", 0, "게임 파일 확인 중");
    gameProcess = await launcher.launch(opts);
    if (!gameProcess) throw new Error("게임을 실행하지 못했어요. 로그를 확인해 주세요.");
    progress("done", 100, "너굴마을로 접속 중");
    send("launch:started", {});
    if (s.hideOnLaunch) setTimeout(() => mainWindow?.hide(), 2500);
    return { ok: true };
  } catch (err) {
    log("[실행] 실패: " + (err?.stack || err));
    gameProcess = null;
    return { ok: false, error: String(err?.message || err) };
  } finally {
    launching = false;
  }
});

ipcMain.handle("launch:stop", () => {
  if (!gameProcess) return { ok: false };
  try {
    if (process.platform === "win32") require("child_process").exec(`taskkill /pid ${gameProcess.pid} /T /F`);
    else gameProcess.kill("SIGTERM");
  } catch (_) {}
  return { ok: true };
});

// ─── 설치된 파일 목록 (모드/리소스팩/쉐이더) ──────────────────────────────────
// 모드는 끄면 .jar.disabled 로 이름만 바꿈
function installedMeta() {
  return store.get("installed") || {}; // { [fileName]: { projectId, title, icon, kind } }
}
function setInstalledMeta(fileName, meta) {
  const all = installedMeta();
  if (meta) all[fileName] = meta;
  else delete all[fileName];
  store.set("installed", all);
}

const KIND_EXT = { mod: [".jar", ".jar.disabled"], resourcepack: [".zip"], shader: [".zip"] };

async function listInstalled(kind) {
  const dir = DIRS[kind];
  const meta = installedMeta();
  const names = await fsp.readdir(dir).catch(() => []);
  const out = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const full = path.join(dir, name);
    const st = await fsp.stat(full).catch(() => null);
    if (!st) continue;
    const isDir = st.isDirectory();
    if (!isDir && !KIND_EXT[kind].some((e) => lower.endsWith(e))) continue;
    if (isDir && kind === "mod") continue;
    const enabled = !lower.endsWith(".disabled");
    const baseName = enabled ? name : name.replace(/\.disabled$/i, "");
    const m = meta[baseName] || {};
    out.push({
      fileName: name,
      baseName,
      enabled,
      size: isDir ? 0 : st.size,
      title: m.title || baseName.replace(/\.(jar|zip)$/i, ""),
      icon: m.icon || null,
      projectId: m.projectId || null,
      neogul: m.neogul || null,
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title, "ko"));
  return out;
}

ipcMain.handle("installed:list", (_e, kind) => listInstalled(kind));

function safeName(name) {
  const base = path.basename(String(name || ""));
  if (!base || base === "." || base === "..") throw new Error("파일 이름이 이상해요.");
  return base;
}

ipcMain.handle("installed:toggle", async (_e, kind, fileName) => {
  if (kind !== "mod") return { ok: false };
  const name = safeName(fileName);
  const from = path.join(DIRS.mod, name);
  const to = name.endsWith(".disabled") ? from.replace(/\.disabled$/, "") : from + ".disabled";
  await fsp.rename(from, to);
  return { ok: true };
});

ipcMain.handle("installed:remove", async (_e, kind, fileName) => {
  const name = safeName(fileName);
  const full = path.join(DIRS[kind], name);
  await fsp.rm(full, { recursive: true, force: true });
  setInstalledMeta(name.replace(/\.disabled$/i, ""), null);
  if (kind === "resourcepack") setResourcePackEnabled(name, false);
  if (kind === "shader" && activeShader() === name) setShader(null);
  return { ok: true };
});

// 파일 직접 추가 (끌어다 놓기/파일 선택)
ipcMain.handle("installed:add-files", async (_e, kind) => {
  const filters = kind === "mod" ? [{ name: "모드", extensions: ["jar"] }] : [{ name: "압축 파일", extensions: ["zip"] }];
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openFile", "multiSelections"], filters });
  if (r.canceled) return { ok: false };
  for (const f of r.filePaths) await fsp.copyFile(f, path.join(DIRS[kind], path.basename(f)));
  return { ok: true, count: r.filePaths.length };
});

// ─── 리소스팩 적용 (options.txt) / 쉐이더 적용 (iris.properties) ──────────────
const OPTIONS = path.join(GAME_DIR, "options.txt");

function readOptions() {
  try {
    return fs.readFileSync(OPTIONS, "utf-8").split(/\r?\n/);
  } catch (_) {
    return [];
  }
}
function getOption(lines, key) {
  const line = lines.find((l) => l.startsWith(key + ":"));
  return line ? line.slice(key.length + 1) : null;
}
function setOption(lines, key, value) {
  const i = lines.findIndex((l) => l.startsWith(key + ":"));
  if (i >= 0) lines[i] = `${key}:${value}`;
  else lines.push(`${key}:${value}`);
}
function enabledResourcePacks() {
  try {
    return JSON.parse(getOption(readOptions(), "resourcePacks") || "[]");
  } catch (_) {
    return [];
  }
}
function setResourcePackEnabled(fileName, on) {
  const lines = readOptions().filter((l) => l !== "");
  let packs = enabledResourcePacks();
  if (!packs.includes("vanilla")) packs.unshift("vanilla");
  const id = `file/${fileName}`;
  packs = packs.filter((p) => p !== id);
  if (on) packs.push(id); // 목록 뒤쪽일수록 위에 덮어씌워짐
  setOption(lines, "resourcePacks", JSON.stringify(packs));
  let incompatible = [];
  try { incompatible = JSON.parse(getOption(lines, "incompatibleResourcePacks") || "[]"); } catch (_) {}
  setOption(lines, "incompatibleResourcePacks", JSON.stringify(incompatible.filter((p) => p !== id)));
  fs.writeFileSync(OPTIONS, lines.join("\n") + "\n");
}

const IRIS_PROPS = path.join(GAME_DIR, "config", "iris.properties");
function readProps() {
  try {
    return fs.readFileSync(IRIS_PROPS, "utf-8").split(/\r?\n/);
  } catch (_) {
    return [];
  }
}
function activeShader() {
  const lines = readProps();
  const enabled = lines.find((l) => l.startsWith("enableShaders="));
  if (enabled && enabled.split("=")[1].trim() === "false") return null;
  const pack = lines.find((l) => l.startsWith("shaderPack="));
  return pack ? pack.slice("shaderPack=".length).trim() || null : null;
}
function setShader(fileName) {
  const lines = readProps().filter((l) => l && !l.startsWith("shaderPack=") && !l.startsWith("enableShaders="));
  lines.push(`enableShaders=${fileName ? "true" : "false"}`);
  if (fileName) lines.push(`shaderPack=${fileName}`);
  fs.mkdirSync(path.dirname(IRIS_PROPS), { recursive: true });
  fs.writeFileSync(IRIS_PROPS, lines.join("\n") + "\n");
}

ipcMain.handle("apply:state", () => ({
  resourcePacks: enabledResourcePacks().filter((p) => p.startsWith("file/")).map((p) => p.slice(5)),
  shader: activeShader(),
}));
ipcMain.handle("apply:resourcepack", (_e, fileName, on) => {
  setResourcePackEnabled(safeName(fileName), !!on);
  return { ok: true };
});
ipcMain.handle("apply:shader", async (_e, fileName) => {
  if (fileName) {
    // 쉐이더는 Iris(+Sodium)가 있어야 돌아감 - 없으면 같이 설치
    await ensureShaderLoader();
  }
  setShader(fileName ? safeName(fileName) : null);
  return { ok: true };
});

// ─── 너굴마을 전용 모드 ──────────────────────────────────────────────────────
const re = (list) => (list || []).map((p) => new RegExp(p, "i"));
const plain = (n) => n.replace(/\.disabled$/i, "");

async function modFiles() {
  return (await fsp.readdir(DIRS.mod).catch(() => [])).filter((n) => /\.jar(\.disabled)?$/i.test(n));
}

ipcMain.handle("neogul:list", async () => {
  const files = await modFiles();
  const rpInstalled = fs.existsSync(path.join(DIRS.resourcepack, NEOGUL_RESOURCEPACK.fileName));
  return {
    mods: NEOGUL_MODS.map((m) => {
      const pats = re(m.patterns);
      const found = pats.map((rx) => files.find((f) => rx.test(plain(f))));
      return {
        id: m.id,
        name: m.name,
        sub: m.sub,
        desc: m.desc,
        wiki: m.wiki,
        installed: found.every(Boolean),
        enabled: found.every((f) => f && !/\.disabled$/i.test(f)),
        update: neogulUpdates.some((u) => u.id === m.id),
      };
    }),
    resourcepack: { ...NEOGUL_RESOURCEPACK, installed: rpInstalled },
  };
});

ipcMain.handle("neogul:install", async (_e, id) => {
  const r = await installNeogulMod(id);
  checkNeogulUpdates().catch(() => {});
  return r;
});
async function installNeogulMod(id) {
  const mod = NEOGUL_MODS.find((m) => m.id === id);
  if (!mod) return { ok: false, error: "모르는 모드예요." };
  try {
    const pats = re(mod.patterns);
    const shared = re(mod.shared);
    const files = await modFiles();
    // 옛 버전 정리 (구버전과 신버전을 같이 넣으면 안 됨)
    for (const f of files) if (pats.some((rx) => rx.test(plain(f)))) await fsp.rm(path.join(DIRS.mod, f), { force: true });

    for (const dl of mod.downloads) {
      const fileName = safeName(decodeURIComponent(new URL(dl.url).pathname.split("/").pop()));
      if (dl.kind === "jar") {
        // 같이 쓰는 라이브러리(Fabric API)는 이미 있으면 건너뜀
        if (shared.some((rx) => rx.test(fileName)) && files.some((f) => shared.some((rx) => rx.test(plain(f))))) continue;
        await download(dl.url, path.join(DIRS.mod, fileName));
        setInstalledMeta(fileName, { title: shared.some((rx) => rx.test(fileName)) ? "Fabric API" : mod.sub, neogul: mod.id });
      } else {
        const zip = new AdmZip(await downloadBuffer(dl.url));
        let extracted = 0;
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const base = path.basename(entry.entryName);
          if (!/\.jar$/i.test(base) || !pats.some((rx) => rx.test(base))) continue;
          await fsp.writeFile(path.join(DIRS.mod, safeName(base)), entry.getData());
          setInstalledMeta(base, { title: `${mod.name} (${base.replace(/\.jar$/i, "")})`, neogul: mod.id });
          extracted++;
        }
        if (!extracted) throw new Error("압축 파일 안에서 모드를 찾지 못했어요.");
      }
    }
    log(`[너굴 모드] 설치: ${mod.name}`);
    return { ok: true };
  } catch (err) {
    log(`[너굴 모드] 설치 실패 ${mod.name}: ` + (err?.stack || err));
    return { ok: false, error: String(err?.message || err) };
  }
}

ipcMain.handle("neogul:remove", async (_e, id) => {
  const mod = NEOGUL_MODS.find((m) => m.id === id);
  if (!mod) return { ok: false };
  const pats = re(mod.patterns);
  for (const f of await modFiles()) {
    if (pats.some((rx) => rx.test(plain(f)))) {
      await fsp.rm(path.join(DIRS.mod, f), { force: true });
      setInstalledMeta(plain(f), null);
    }
  }
  return { ok: true };
});

// ─── 너굴마을 전용 모드 업데이트 확인 ─────────────────────────────────────────
// 위키에 올라온 파일(주소는 refreshWikiInfo 가 따라감)과 mods 폴더에 깔린 파일 이름을 비교.
//   jar 주소  → 주소의 파일 이름이 깔려 있지 않으면 새 버전
//   zip 주소  → ETag 가 바뀌었을 때만 받아서 안의 jar 이름을 적어 두고, 그 이름이 깔려 있지 않으면 새 버전
let neogulUpdates = []; // [{ id, name, files: [새 파일 이름] }]
let neogulCheckBusy = false;
async function zipJarNames(dl, pats) {
  const cache = store.get("neogulZipCache") || {};
  const c = cache[dl.url];
  let etag = null;
  try {
    const head = await fetch(dl.url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, timeout: 8000 });
    if (head.ok) etag = head.headers.get("etag") || head.headers.get("last-modified") || head.headers.get("content-length");
  } catch (_) {}
  if (c && (!etag || c.etag === etag)) return c.jars; // 못 물어봤으면 전에 본 걸로
  const zip = new AdmZip(await downloadBuffer(dl.url));
  const jars = zip.getEntries().filter((e) => !e.isDirectory).map((e) => path.basename(e.entryName)).filter((b) => /\.jar$/i.test(b) && pats.some((rx) => rx.test(b)));
  cache[dl.url] = { etag, jars, at: Date.now() };
  store.set("neogulZipCache", cache);
  return jars;
}
async function checkNeogulUpdates() {
  if (neogulCheckBusy) return neogulUpdates;
  neogulCheckBusy = true;
  try {
    const files = (await modFiles()).map(plain);
    const out = [];
    for (const m of NEOGUL_MODS) {
      const pats = re(m.patterns);
      const shared = re(m.shared);
      if (!pats.every((rx) => files.some((f) => rx.test(f)))) continue; // 안 깐 모드는 알리지 않음
      const want = [];
      for (const dl of m.downloads) {
        try {
          if (dl.kind === "jar") {
            const name = safeName(decodeURIComponent(new URL(dl.url).pathname.split("/").pop()));
            if (shared.some((rx) => rx.test(name))) continue; // 같이 쓰는 Fabric API 는 제외
            want.push(name);
          } else {
            want.push(...(await zipJarNames(dl, pats)).map(safeName));
          }
        } catch (err) {
          log(`[너굴 모드] 업데이트 확인 실패 ${m.name}: ` + (err?.message || err));
        }
      }
      const missing = want.filter((n) => !files.includes(n));
      if (missing.length) out.push({ id: m.id, name: m.name, files: missing });
    }
    const before = neogulUpdates.map((u) => u.id + ":" + u.files.join(",")).join("|");
    neogulUpdates = out;
    const after = out.map((u) => u.id + ":" + u.files.join(",")).join("|");
    if (before !== after) {
      if (out.length) log("[너굴 모드] 업데이트 있음: " + out.map((u) => `${u.name} → ${u.files.join(", ")}`).join(" / "));
      send("neogul:updates", out);
    }
    return out;
  } finally {
    neogulCheckBusy = false;
  }
}
ipcMain.handle("neogul:updates", () => neogulUpdates);
ipcMain.handle("neogul:check-updates", () => checkNeogulUpdates());
ipcMain.handle("neogul:update-all", async () => {
  if (gameProcess) return { ok: false, error: "게임을 끈 뒤에 업데이트해 주세요." };
  const failed = [];
  let count = 0;
  for (const u of [...neogulUpdates]) {
    const mod = NEOGUL_MODS.find((m) => m.id === u.id);
    const pats = re(mod.patterns);
    // 꺼 둔 모드는 업데이트한 뒤에도 꺼 둠
    const wasOff = (await modFiles()).some((f) => /\.disabled$/i.test(f) && pats.some((rx) => rx.test(plain(f))));
    const r = await installNeogulMod(u.id);
    if (!r.ok) { failed.push(u.name); continue; }
    count++;
    if (wasOff) {
      for (const f of await modFiles()) {
        if (!/\.disabled$/i.test(f) && pats.some((rx) => rx.test(f))) await fsp.rename(path.join(DIRS.mod, f), path.join(DIRS.mod, f + ".disabled")).catch(() => {});
      }
    }
  }
  await checkNeogulUpdates();
  send("neogul:updated", {});
  return { ok: true, updated: count, failed };
});

ipcMain.handle("neogul:install-resourcepack", async () => {
  try {
    const dest = path.join(DIRS.resourcepack, NEOGUL_RESOURCEPACK.fileName);
    await download(NEOGUL_RESOURCEPACK.url, dest, (p) => send("dl:progress", { id: "neogul-rp", pct: Math.round(p) }));
    setInstalledMeta(NEOGUL_RESOURCEPACK.fileName, { title: NEOGUL_RESOURCEPACK.name, neogul: "resourcepack" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// ─── Modrinth (모드 / 리소스팩 / 쉐이더 검색 · 원클릭 설치) ────────────────────
async function mr(pathAndQuery) {
  const res = await fetch(MODRINTH + pathAndQuery, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Modrinth 응답 오류 (${res.status})`);
  return res.json();
}
const MR_TYPE = { mod: "mod", resourcepack: "resourcepack", shader: "shader" };
const MR_LOADERS = { mod: ["fabric"], resourcepack: ["minecraft"], shader: ["iris"] };

ipcMain.handle("modrinth:search", async (_e, { kind, query, offset = 0, sort = "relevance" }) => {
  try {
    const facets = [[`project_type:${MR_TYPE[kind]}`], [`versions:${SERVER.mcVersion}`]];
    if (kind === "mod") facets.push(["categories:fabric"]);
    if (kind === "shader") facets.push(["categories:iris"]);
    const q = new URLSearchParams({
      query: query || "",
      facets: JSON.stringify(facets),
      index: ["relevance", "downloads", "follows", "newest", "updated"].includes(sort) ? sort : "relevance",
      limit: "20",
      offset: String(Math.max(0, Number(offset) || 0)),
    });
    const data = await mr(`/search?${q}`);
    const meta = installedMeta();
    const installedIds = new Set(Object.values(meta).map((m) => m.projectId).filter(Boolean));
    return {
      ok: true,
      total: data.total_hits,
      hits: data.hits.map((h) => ({
        id: h.project_id,
        slug: h.slug,
        title: h.title,
        author: h.author,
        desc: h.description,
        icon: h.icon_url || null,
        downloads: h.downloads,
        follows: h.follows,
        gallery: h.featured_gallery || h.gallery?.[0] || null,
        installed: installedIds.has(h.project_id),
      })),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("modrinth:project", async (_e, id) => {
  try {
    const p = await mr(`/project/${encodeURIComponent(id)}`);
    return {
      ok: true,
      project: {
        id: p.id,
        slug: p.slug,
        type: p.project_type,
        title: p.title,
        desc: p.description,
        body: p.body,
        icon: p.icon_url,
        downloads: p.downloads,
        follows: p.followers,
        categories: p.categories,
        gallery: (p.gallery || []).map((g) => g.url).slice(0, 8),
        url: `https://modrinth.com/${p.project_type}/${p.slug}`,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// 이 프로젝트에서 26.1.2 에 맞는 가장 좋은 버전 (정식 > 베타 > 알파)
async function bestVersion(projectId, kind) {
  const q = new URLSearchParams({
    game_versions: JSON.stringify([SERVER.mcVersion]),
    loaders: JSON.stringify(MR_LOADERS[kind]),
  });
  let versions = await mr(`/project/${encodeURIComponent(projectId)}/version?${q}`);
  if (!versions.length && kind !== "mod") {
    // 리소스팩/쉐이더는 로더 표기가 제각각이라 버전만으로 한 번 더
    versions = await mr(`/project/${encodeURIComponent(projectId)}/version?game_versions=${encodeURIComponent(JSON.stringify([SERVER.mcVersion]))}`);
  }
  const rank = { release: 0, beta: 1, alpha: 2 };
  versions.sort((a, b) => (rank[a.version_type] ?? 3) - (rank[b.version_type] ?? 3) || new Date(b.date_published) - new Date(a.date_published));
  return versions[0] || null;
}

async function installProject(projectId, kind, seen = new Set()) {
  if (seen.has(projectId)) return [];
  seen.add(projectId);
  const version = await bestVersion(projectId, kind);
  if (!version) throw new Error(`${SERVER.mcVersion} 용 파일이 없어요.`);
  const file = version.files.find((f) => f.primary) || version.files[0];
  const fileName = safeName(file.filename);
  const project = await mr(`/project/${encodeURIComponent(projectId)}`);
  const realId = project.id || projectId; // slug 로 불러도 진짜 id 로 기록
  seen.add(realId);

  // 같은 프로젝트의 예전 파일 지우기
  const meta = installedMeta();
  for (const [name, m] of Object.entries(meta)) {
    if (m.projectId === realId && name !== fileName) {
      await fsp.rm(path.join(DIRS[kind], name), { force: true });
      await fsp.rm(path.join(DIRS[kind], name + ".disabled"), { force: true });
      setInstalledMeta(name, null);
    }
  }
  await download(file.url, path.join(DIRS[kind], fileName), (p) =>
    send("dl:progress", { id: projectId, pct: Math.round(p) })
  );
  setInstalledMeta(fileName, { projectId: realId, slug: project.slug || null, title: project.title, icon: project.icon_url || null, kind });
  const installed = [project.title];

  // 모드는 꼭 필요한 의존 모드(Fabric API 등)도 같이
  if (kind === "mod") {
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== "required" || !dep.project_id) continue;
      if (Object.values(installedMeta()).some((m) => m.projectId === dep.project_id)) continue;
      try {
        installed.push(...(await installProject(dep.project_id, "mod", seen)));
      } catch (err) {
        log(`[Modrinth] 의존 모드 설치 실패 ${dep.project_id}: ` + (err?.message || err));
      }
    }
  }
  return installed;
}

// 쉐이더용 Iris + Sodium
const IRIS_ID = "YL57xq9U";
const SODIUM_ID = "AANobbMI";
async function ensureShaderLoader() {
  const meta = Object.values(installedMeta());
  const files = await modFiles();
  const has = (projectId, rx) => meta.some((m) => m.projectId === projectId) || files.some((f) => rx.test(f));
  const added = [];
  if (!has(SODIUM_ID, /^sodium-/i)) added.push(...(await installProject(SODIUM_ID, "mod")));
  if (!has(IRIS_ID, /^iris-/i)) added.push(...(await installProject(IRIS_ID, "mod")));
  return added;
}

ipcMain.handle("modrinth:install", async (_e, { id, kind, apply }) => {
  try {
    const installed = await installProject(id, kind);
    let extra = [];
    let warning = null;
    if (kind === "shader") {
      try {
        extra = await ensureShaderLoader();
      } catch (err) {
        warning = `쉐이더용 Iris/Sodium 을 받지 못했어요 (${err?.message || err}). 나중에 모드 탭에서 직접 설치해 주세요.`;
      }
    }
    // "넣기까지" - 리소스팩/쉐이더는 설치하자마자 게임에 적용
    if (apply) {
      const fileName = Object.entries(installedMeta()).find(([, m]) => m.projectId === id)?.[0];
      if (fileName && kind === "resourcepack") setResourcePackEnabled(fileName, true);
      if (fileName && kind === "shader") setShader(fileName);
    }
    return { ok: true, installed: [...installed, ...extra], warning };
  } catch (err) {
    log(`[Modrinth] 설치 실패 ${id}: ` + (err?.stack || err));
    return { ok: false, error: String(err?.message || err) };
  }
});

// ─── 스킨 ────────────────────────────────────────────────────────────────────
ipcMain.handle("skin:current", async () => {
  const token = accessToken();
  if (!token) return { ok: false, needLogin: true };
  try {
    const res = await fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`프로필을 못 불러왔어요 (${res.status})`);
    const p = await res.json();
    const skin = (p.skins || []).find((s) => s.state === "ACTIVE") || p.skins?.[0];
    const cape = (p.capes || []).find((c) => c.state === "ACTIVE");
    const toData = async (url) => (url ? "data:image/png;base64," + (await downloadBuffer(url)).toString("base64") : null);
    return {
      ok: true,
      name: p.name,
      variant: skin?.variant === "SLIM" ? "slim" : "classic",
      skin: await toData(skin?.url),
      cape: await toData(cape?.url),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("skin:pick", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "스킨 (PNG)", extensions: ["png"] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const buf = await fsp.readFile(r.filePaths[0]);
  // 64x64 또는 64x32 PNG 인지 확인 (IHDR 의 가로/세로)
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const w = isPng ? buf.readUInt32BE(16) : 0;
  const h = isPng ? buf.readUInt32BE(20) : 0;
  if (!isPng || w !== 64 || (h !== 64 && h !== 32)) {
    return { ok: false, error: "64×64 크기의 PNG 스킨 파일만 쓸 수 있어요." };
  }
  return { ok: true, path: r.filePaths[0], name: path.basename(r.filePaths[0]), dataUrl: "data:image/png;base64," + buf.toString("base64") };
});

ipcMain.handle("skin:upload", async (_e, { filePath, variant }) => {
  const token = accessToken();
  if (!token) return { ok: false, needLogin: true };
  try {
    const buf = await fsp.readFile(filePath);
    const form = new FormData();
    form.append("variant", variant === "slim" ? "slim" : "classic");
    form.append("file", new Blob([buf], { type: "image/png" }), path.basename(filePath));
    const res = await globalThis.fetch("https://api.minecraftservices.com/minecraft/profile/skins", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new Error(`스킨을 바꾸지 못했어요 (${res.status})`);
    // 최근에 쓴 스킨 목록(이 PC 에만, 최대 12개)
    const dir = path.join(ROOT, "skins");
    await fsp.mkdir(dir, { recursive: true });
    const id = `skin-${Date.now()}`;
    const saved = path.join(dir, `${id}.png`);
    await fsp.writeFile(saved, buf);
    const list = (store.get("recentSkins") || []).slice(0, 11);
    list.unshift({ id, path: saved, variant: variant === "slim" ? "slim" : "classic", name: path.basename(filePath, ".png") });
    store.set("recentSkins", list);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle("skin:recent", async () => {
  const list = (store.get("recentSkins") || []).filter((s) => fs.existsSync(s.path));
  return Promise.all(
    list.map(async (s) => ({ ...s, dataUrl: "data:image/png;base64," + (await fsp.readFile(s.path)).toString("base64") }))
  );
});

// ─── 꾸미기: 주 1회 뽑기 · 보관함 · 도감 ──────────────────────────────────────
// 모든 기록은 마크 계정(uuid)별로 이 PC 에만 저장. 계정은 1개만 쓰므로 사실상 한 사람 것.
const WEEK_MS = 7 * 24 * 3600 * 1000;
const KST = 9 * 3600 * 1000;

// 한국 시간 월요일 0시를 기준으로 한 주
function weekStart(ts = Date.now()) {
  const k = new Date(ts + KST);
  const daysSinceMonday = (k.getUTCDay() + 6) % 7;
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - daysSinceMonday) - KST;
}

function currentUuid() {
  return String(secure.get("account")?.uuid || "").replace(/-/g, "") || null;
}
function getCollection(uuid) {
  const all = secure.get("collection") || {};
  const c = all[uuid] || {};
  c.owned = c.owned || {};
  if (!c.owned["nugul-orange"]) c.owned["nugul-orange"] = { count: 1, at: Date.now(), from: "기본" };
  c.history = c.history || [];
  return c;
}
function saveCollection(uuid, c) {
  const all = secure.get("collection") || {};
  all[uuid] = c;
  secure.set("collection", all);
}

// 노바 클라이언트 보관함(색상 · 테마) 읽기 - 노바클 파일은 읽기만 함
function readNovaCosmetics(uuid) {
  try {
    const file = path.join(app.getPath("appData"), "NovaClient", "config.json");
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const all = data.player_data || {};
    const key = Object.keys(all).find((k) => k.replace(/-/g, "") === uuid);
    const pd = key ? all[key] : null;
    const owned = (pd?.ownedColors || []).filter((id) => COSMETICS.byId(id));
    return {
      owned,
      equippedColor: COSMETICS.byId(pd?.equippedColor)?.kind === "color" ? pd.equippedColor : null,
      equippedTheme: COSMETICS.byId(pd?.equippedThemeMode)?.kind === "theme" ? pd.equippedThemeMode : null,
      baseMode: data.settings?.theme === "light" ? "white" : null,
    };
  } catch (err) {
    log("[노바 보관함] 읽기 실패: " + (err?.message || err));
    return null;
  }
}

function importNova(uuid, c) {
  const nova = readNovaCosmetics(uuid);
  const added = [];
  if (nova) {
    for (const id of nova.owned) {
      if (c.owned[id]) continue;
      c.owned[id] = { count: 1, at: Date.now(), from: "노바클" };
      added.push(id);
    }
    if (!c.novaImported) {
      // 처음 가져올 때만 노바클에서 쓰던 그대로 장착
      if (nova.equippedColor && c.owned[nova.equippedColor]) c.equippedColor = nova.equippedColor;
      if (nova.equippedTheme && c.owned[nova.equippedTheme]) c.equippedTheme = nova.equippedTheme;
      if (nova.baseMode && !store.get("settings")?.baseMode) store.set("settings", { ...getSettings(), baseMode: nova.baseMode });
    }
  }
  c.novaImported = true;
  return { found: !!nova, added };
}

function collectionState(uuid, c, extra = {}) {
  const ws = weekStart();
  return {
    loggedIn: true,
    owned: c.owned,
    equippedColor: c.equippedColor || "nugul-orange",
    equippedTheme: c.equippedTheme || null,
    canPull: (c.lastPullWeek || 0) < ws,
    lastPull: c.history[0] || null,
    nextResetAt: ws + WEEK_MS,
    novaFound: !!readNovaCosmetics(uuid),
    ...extra,
    tampered: takeTamperNotice(),
  };
}

function takeTamperNotice() {
  loadSecure();
  const t = secureTampered;
  secureTampered = false;
  return t;
}

ipcMain.handle("cosmetics:state", () => {
  const uuid = currentUuid();
  if (!uuid) return { tampered: takeTamperNotice(), loggedIn: false, owned: { "nugul-orange": { count: 1, from: "기본" } }, equippedColor: "nugul-orange", equippedTheme: null, nextResetAt: weekStart() + WEEK_MS };
  const c = getCollection(uuid);
  let imported = [];
  if (!c.novaImported) imported = importNova(uuid, c).added; // 처음 한 번은 자동으로 가져옴
  saveCollection(uuid, c);
  return collectionState(uuid, c, { imported });
});

ipcMain.handle("cosmetics:import-nova", () => {
  const uuid = currentUuid();
  if (!uuid) return { ok: false, error: "먼저 로그인해 주세요." };
  const c = getCollection(uuid);
  const r = importNova(uuid, c);
  saveCollection(uuid, c);
  if (!r.found) return { ok: false, error: "이 계정의 노바 클라이언트 보관함을 찾지 못했어요." };
  return { ok: true, added: r.added };
});

function rollOnce() {
  const tiers = Object.entries(COSMETICS.RARITY).filter(([, r]) => r.weight > 0);
  const total = tiers.reduce((a, [, r]) => a + r.weight, 0);
  let roll = Math.random() * total;
  let tier = tiers[0][0];
  for (const [key, r] of tiers) {
    if ((roll -= r.weight) < 0) {
      tier = key;
      break;
    }
  }
  const pool = COSMETICS.ITEMS.filter((i) => i.rarity === tier);
  return pool[Math.floor(Math.random() * pool.length)];
}

// 뽑기는 PC 시계가 아니라 인터넷 시각으로 판단 (PC 날짜를 바꿔서 다시 뽑는 것 방지)
async function networkNow() {
  for (const url of ["https://mcng.kr/", "https://api.modrinth.com/", "https://www.google.com/"]) {
    try {
      const r = await fetch(url, { method: "HEAD", timeout: 8000, headers: { "User-Agent": USER_AGENT } });
      const t = Date.parse(r.headers.get("date") || "");
      if (Number.isFinite(t)) return t;
    } catch (_) {}
  }
  return null;
}

ipcMain.handle("cosmetics:pull", async () => {
  const uuid = currentUuid();
  if (!uuid) return { ok: false, needLogin: true };
  const now = await networkNow();
  if (!now) return { ok: false, error: "뽑기는 인터넷에 연결돼 있을 때만 할 수 있어요." };
  if (Math.abs(now - Date.now()) > 10 * 60 * 1000) log(`[뽑기] PC 시계가 ${Math.round((Date.now() - now) / 60000)}분 어긋나 있음 - 인터넷 시각으로 판단`);
  const c = getCollection(uuid);
  const ws = weekStart(now);
  if ((c.lastPullWeek || 0) >= ws) return { ok: false, error: "이번 주 뽑기는 이미 했어요." };
  // 겹치면 두 번까지 다시 굴려서 도감이 너무 안 차지 않게
  let item = rollOnce();
  for (let i = 0; i < 2 && c.owned[item.id]; i++) item = rollOnce();
  const isNew = !c.owned[item.id];
  const prev = c.owned[item.id];
  c.owned[item.id] = { count: (prev?.count || 0) + 1, at: prev?.at || Date.now(), from: prev?.from || "뽑기" };
  c.lastPullWeek = ws;
  c.history.unshift({ id: item.id, at: now, isNew });
  c.history = c.history.slice(0, 60);
  saveCollection(uuid, c);
  log(`[뽑기] ${item.name} (${item.rarity}${isNew ? ", 새로 얻음" : ""})`);
  return { ok: true, id: item.id, isNew, count: c.owned[item.id].count, state: collectionState(uuid, c) };
});

ipcMain.handle("cosmetics:equip", (_e, kind, id) => {
  const uuid = currentUuid();
  if (!uuid) return { ok: false, needLogin: true };
  const c = getCollection(uuid);
  if (id && (!c.owned[id] || COSMETICS.byId(id)?.kind !== kind)) return { ok: false, error: "갖고 있지 않은 아이템이에요." };
  if (kind === "color") c.equippedColor = id || "nugul-orange";
  if (kind === "theme") c.equippedTheme = id || null;
  saveCollection(uuid, c);
  return { ok: true, state: collectionState(uuid, c) };
});

// ─── 자동 업데이트 (GitHub Releases) ─────────────────────────────────────────
let updateState = { status: "idle" }; // idle | checking | none | downloading | ready | error
function setUpdate(st) {
  updateState = { ...updateState, ...st };
  send("update:state", updateState);
}
let pendingAutoInstall = false;
function autoInstallSoon(version) {
  log(`[업데이트] ${version || ""} 자동 설치 시작`);
  send("update:installing", { version });
  // 화면에 "업데이트 중" 알림이 잠깐 보이게 하고 완전히 종료 → 설치 → 다시 실행
  setTimeout(() => {
    if (gameProcess || launching) { pendingAutoInstall = true; return; }
    try { autoUpdater.quitAndInstall(true, true); } catch (err) { log("[업데이트] 설치 실패: " + (err?.message || err)); }
  }, 2500);
}
function setupAutoUpdate() {
  if (!app.isPackaged) return; // npm start 로 켤 땐 안 함
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // 받아만 두면 다음에 끌 때 설치됨
  autoUpdater.on("checking-for-update", () => setUpdate({ status: "checking" }));
  autoUpdater.on("update-not-available", () => setUpdate({ status: "none" }));
  autoUpdater.on("update-available", (info) => setUpdate({ status: "downloading", version: info.version, pct: 0 }));
  autoUpdater.on("download-progress", (p) => setUpdate({ status: "downloading", pct: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => {
    setUpdate({ status: "ready", version: info.version });
    // 노바클처럼: 마크가 꺼져 있으면 바로 조용히 설치하고 다시 켬, 켜져 있으면 끈 직후에
    if (gameProcess || launching) {
      pendingAutoInstall = true;
      log(`[업데이트] ${info.version} 받음 - 게임을 끄면 설치`);
    } else {
      autoInstallSoon(info.version);
    }
  });
  autoUpdater.on("error", (err) => {
    log("[업데이트] " + (err?.message || err));
    setUpdate({ status: "error" });
  });
  checkUpdateNow(true);
  // 5분마다 + 창을 다시 볼 때 + 게임을 껐을 때 확인 (받는 중이거나 이미 받아 둔 때는 건너뜀)
  setInterval(() => checkUpdateNow(), 5 * 60 * 1000);
  app.on("browser-window-focus", () => checkUpdateNow());
}
let lastUpdateCheck = 0;
function checkUpdateNow(force) {
  if (!app.isPackaged) return;
  if (["checking", "downloading", "ready"].includes(updateState.status)) return;
  if (!force && Date.now() - lastUpdateCheck < 60 * 1000) return; // 너무 잦지 않게 1분 간격은 둠
  lastUpdateCheck = Date.now();
  autoUpdater.checkForUpdates().catch(() => {});
}
// ─── 서버 추천 여부: 게임 채팅에 뜨는 서버 안내로 알아냄 ─────────────────────────
//   "<내 닉네임>님이 오늘 N번째로 서버를 추천해주셨습니다!" / "추천 보상이 /우편함으로 지급되었습니다!"
function watchRecommend(text) {
  if (!text.includes("[CHAT]") || !text.includes("추천")) return;
  if (!/\[System\] \[CHAT\]/.test(text)) return; // 다른 유저가 채팅으로 따라 친 건 무시
  const name = secure.get("account")?.name;
  const mine = name && text.includes(`${name}님이 오늘`) && text.includes("서버를 추천해주셨습니다");
  if (!mine && !text.includes("추천 보상이 /우편함으로 지급되었습니다")) return;
  const day = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (day(store.get("recommendAt") || 0) === day(Date.now())) return; // 오늘 이미 기록함 (안내가 두 줄 연달아 옴)
  store.set("recommendAt", Date.now());
  log("[추천] 오늘 서버 추천 확인");
  send("rec:done", { at: Date.now() });
}
ipcMain.handle("rec:get", () => ({ at: store.get("recommendAt") || 0 }));

ipcMain.handle("update:state", () => ({ ...updateState, packaged: app.isPackaged }));
ipcMain.handle("update:check", async () => {
  if (!app.isPackaged) return { ok: false, error: "설치한 버전에서만 업데이트를 확인할 수 있어요." };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});
ipcMain.handle("update:install", () => {
  if (gameProcess) return { ok: false, error: "게임을 끈 다음 업데이트할 수 있어요." };
  setImmediate(() => autoUpdater.quitAndInstall(true, true)); // 조용히 설치하고 다시 켜짐
  return { ok: true };
});

// ─── 계산기 (요리 시세) · 질문 도우미 (위키) ─────────────────────────────────
// 요리 시세는 매일 00시에 바뀌고, 00:30(한국 시간)에 받아와서 화면에 바로 반영해요.
// 위키 · 규칙 페이지는 질문 도우미가 찾아볼 수 있게 받아서 PC에 저장해 둬요(12시간마다 새로).
const COOK_API = "https://mcng.kr/api/v1/public/cook/prices";
const COOK_HISTORY = "https://mcng.kr/data/cook-price-history.json";
const KB_PAGES = { wiki: "https://mcng.kr/wiki", rules: "https://mcng.kr/rules" };
const KST_MS = 9 * 3600 * 1000;
const TOOLS_DIR = path.join(ROOT, "tools");
const cookFile = path.join(TOOLS_DIR, "cook-prices.json");
const kbFile = (k) => path.join(TOOLS_DIR, `kb-${k}.html`);
const kbMeta = path.join(TOOLS_DIR, "kb-meta.json");

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return d; } };
const writeFile = (f, data) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); } catch (e) { log("[도구] 저장 실패 " + e.message); } };
const kstToday = () => new Date(Date.now() + KST_MS).toISOString().slice(0, 10);

let cook = Object.assign({ prices: null, history: null, fetchedAt: 0, error: null, nextRefresh: 0 }, readJson(cookFile, {}));
let cookTimer = null, cookRetry = null;

function nextCookRefresh() {
  const k = new Date(Date.now() + KST_MS);
  let t = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), 0, 30) - KST_MS;
  if (t <= Date.now()) t += 24 * 3600 * 1000;
  return t;
}
async function getJsonFrom(url) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Nugulient" }, timeout: 15000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function refreshCook(reason) {
  try {
    const [p, h] = await Promise.all([getJsonFrom(COOK_API), getJsonFrom(COOK_HISTORY).catch(() => null)]);
    if (!p || !p.success || !p.data) throw new Error("시세 응답 형식이 달라요");
    cook.prices = p.data;
    if (h && h.days) cook.history = h;
    cook.fetchedAt = Date.now();
    cook.error = null;
    writeFile(cookFile, JSON.stringify({ prices: cook.prices, history: cook.history, fetchedAt: cook.fetchedAt }));
    clearTimeout(cookRetry);
    if (reason === "schedule" && cook.prices.date !== kstToday()) cookRetry = setTimeout(() => refreshCook("schedule"), 5 * 60 * 1000);
  } catch (e) {
    cook.error = String(e.message || e);
    clearTimeout(cookRetry);
    cookRetry = setTimeout(() => refreshCook(reason), 5 * 60 * 1000);
  }
  scheduleCook();
  send("calc:data", cook);
  return cook;
}
function scheduleCook() {
  clearTimeout(cookTimer);
  cook.nextRefresh = nextCookRefresh();
  const wait = Math.min(cook.nextRefresh - Date.now(), 10 * 60 * 1000);
  cookTimer = setTimeout(() => (Date.now() >= cook.nextRefresh - 1000 ? refreshCook("schedule") : scheduleCook()), Math.max(1000, wait));
}
function cookStale() {
  if (!cook.prices) return true;
  if (cook.prices.date === kstToday()) return false;
  const k = new Date(Date.now() + KST_MS);
  return k.getUTCHours() * 60 + k.getUTCMinutes() >= 30;
}
function startCookSchedule() {
  refreshCook("startup");
  powerMonitor.on("resume", () => (cookStale() ? refreshCook("schedule") : scheduleCook()));
  setInterval(() => { if (cookStale()) refreshCook("schedule"); }, 3600 * 1000);
}
ipcMain.handle("calc:get", () => cook);
ipcMain.handle("calc:refresh", () => refreshCook("manual"));
ipcMain.handle("calc:copy", (_e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle("calc:save-file", async (_e, name, text) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath("downloads"), String(name).replace(/[\\/:*?"<>|]/g, "_")),
    filters: [{ name: "Nova Calculator", extensions: ["json"] }],
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(text), "utf8");
  return r.filePath;
});
ipcMain.handle("calc:open-file", async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ["openFile"], filters: [{ name: "Nova Calculator", extensions: ["json"] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  if (fs.statSync(r.filePaths[0]).size > 2 * 1024 * 1024) return null;
  return fs.readFileSync(r.filePaths[0], "utf8");
});

// 위키 · 규칙 원문 (질문 도우미용)
ipcMain.handle("kb:get", async (_e, force) => {
  const meta = readJson(kbMeta, {});
  const fresh = meta.fetchedAt && Date.now() - meta.fetchedAt < 12 * 3600 * 1000;
  const out = { pages: {}, fetchedAt: meta.fetchedAt || 0, error: null };
  if (force || !fresh) {
    try {
      for (const [k, url] of Object.entries(KB_PAGES)) {
        const r = await fetch(url, { headers: { "User-Agent": "Nugulient" }, timeout: 20000 });
        if (!r.ok) throw new Error(`${k} HTTP ${r.status}`);
        writeFile(kbFile(k), await r.text());
      }
      out.fetchedAt = Date.now();
      writeFile(kbMeta, JSON.stringify({ fetchedAt: out.fetchedAt }));
    } catch (e) {
      out.error = String(e.message || e);
    }
  }
  for (const k of Object.keys(KB_PAGES)) {
    try { out.pages[k] = fs.readFileSync(kbFile(k), "utf8"); } catch (_) { /* 아직 없음 */ }
  }
  return out;
});


// ─── 너굴마을 정보 자동으로 받아오기 (랭킹 · 전용 모드 최신 파일 · 사이트 이미지) ────
// 2시간마다(+켤 때, PC 가 잠에서 깰 때) 받아와서 PC 에 저장해 두고, 못 받으면 저장된 걸 보여줌.
const RANK_URL = "https://mcng.kr/data/rankings.json";
const INFO_EVERY = 2 * 3600 * 1000;
const rankFile = path.join(ROOT, "tools", "rankings.json");
let rank = Object.assign({ data: null, fetchedAt: 0, error: null }, readJson(rankFile, {}));

async function refreshRankings() {
  try {
    const r = await fetch(`${RANK_URL}?t=${Date.now()}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, timeout: 15000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data || typeof data !== "object" || !data.updated) throw new Error("랭킹 형식이 달라요");
    rank = { data, fetchedAt: Date.now(), error: null };
    writeFile(rankFile, JSON.stringify(rank));
  } catch (err) {
    rank.error = String(err?.message || err);
    log("[랭킹] 받기 실패: " + rank.error);
  }
  send("rank:data", rank);
  return rank;
}

// 위키에 올라온 전용 모드 · 리소스팩 링크를 읽어서, 파일 이름(버전)이 바뀌었으면 새 주소로 바꿔 둠
// 예) ng-koreanchat-2.1.4.jar → ng-koreanchat-2.1.5.jar
const stemOf = (u) => decodeURIComponent(String(u).split(/[?#]/)[0].split("/").pop()).toLowerCase().replace(/\d+(\.\d+)*/g, "#");
const versionOf = (u) => (decodeURIComponent(String(u).split(/[?#]/)[0].split("/").pop()).match(/\d+\.\d+(\.\d+)?/) || [null])[0];

function applyModOverrides() {
  const o = store.get("modUrlOverrides") || {};
  for (const m of NEOGUL_MODS) {
    for (const dl of m.downloads) {
      const base = dl.originalUrl || (dl.originalUrl = dl.url);
      dl.url = o[base] || base;
    }
    if (!m.originalSub) m.originalSub = m.sub;
    const main = m.downloads[0];
    const oldV = versionOf(main.originalUrl), newV = versionOf(main.url);
    m.sub = oldV && newV && oldV !== newV ? m.originalSub.replace(oldV, newV) : m.originalSub;
  }
  if (!NEOGUL_RESOURCEPACK.originalUrl) NEOGUL_RESOURCEPACK.originalUrl = NEOGUL_RESOURCEPACK.url;
  NEOGUL_RESOURCEPACK.url = o[NEOGUL_RESOURCEPACK.originalUrl] || NEOGUL_RESOURCEPACK.originalUrl;
}
applyModOverrides();

async function refreshWikiInfo() {
  try {
    const r = await fetch("https://mcng.kr/wiki", { headers: { "User-Agent": USER_AGENT }, timeout: 20000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const links = [...new Set([...html.matchAll(/href=["']([^"']*\/mods\/[^"'#]+)["']/gi)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), "https://mcng.kr/").toString()))];
    if (!links.length) return;
    const o = store.get("modUrlOverrides") || {};
    const targets = [...NEOGUL_MODS.flatMap((m) => m.downloads.map((d) => d.originalUrl || d.url)), NEOGUL_RESOURCEPACK.originalUrl || NEOGUL_RESOURCEPACK.url];
    let changed = 0;
    for (const base of targets) {
      const found = links.find((l) => stemOf(l) === stemOf(base));
      if (!found) continue;
      const next = found === base ? undefined : found;
      if (o[base] !== next) {
        if (next) o[base] = next; else delete o[base];
        changed++;
        log(`[위키] 전용 파일 주소 갱신: ${stemOf(base)} → ${next || base}`);
      }
    }
    if (changed) {
      store.set("modUrlOverrides", o);
      applyModOverrides();
      send("neogul:updated", {});
    }
  } catch (err) {
    log("[위키] 정보 받기 실패: " + (err?.message || err));
  }
}

// 로고 · 섬 전경 사진을 PC 에 받아 둠 (너굴마을 운영진 허락 받음 - 비상업적 사용)
const IMG_DIR = path.join(ROOT, "tools", "images");
const imgFile = (k) => path.join(IMG_DIR, `${k}.png`);
async function refreshImages(force) {
  let changed = false;
  for (const [k, url] of Object.entries(IMAGES)) {
    try {
      const f = imgFile(k);
      const st = fs.existsSync(f) ? fs.statSync(f) : null;
      if (st && !force && Date.now() - st.mtimeMs < 24 * 3600 * 1000) continue;
      const buf = await downloadBuffer(url);
      if (buf.length < 100 || buf.slice(1, 4).toString() !== "PNG") throw new Error("PNG 가 아니에요");
      writeFile(f, buf);
      changed = true;
    } catch (err) {
      log(`[이미지] ${k} 받기 실패: ` + (err?.message || err));
    }
  }
  if (changed) send("images:updated", {});
}
ipcMain.handle("images:get", () => {
  const out = {};
  for (const k of Object.keys(IMAGES)) {
    try { out[k] = "data:image/png;base64," + fs.readFileSync(imgFile(k)).toString("base64"); } catch (_) { out[k] = IMAGES[k]; }
  }
  return out;
});

async function refreshSiteInfo() {
  await Promise.allSettled([refreshRankings(), refreshWikiInfo(), refreshImages()]);
  await checkNeogulUpdates().catch(() => {});
}
function startSiteInfoSchedule() {
  refreshSiteInfo();
  setInterval(refreshSiteInfo, INFO_EVERY);
  powerMonitor.on("resume", () => { if (Date.now() - (rank.fetchedAt || 0) > INFO_EVERY) refreshSiteInfo(); });
}
ipcMain.handle("rank:get", () => rank);
ipcMain.handle("rank:refresh", () => refreshRankings());


// ─── 망고's pick · 너굴마을 기본 모드 한 번에 설치 ─────────────────────────────
function installedProjectKeys() {
  const keys = new Set();
  for (const m of Object.values(installedMeta())) {
    if (m.projectId) keys.add(m.projectId);
    if (m.slug) keys.add(m.slug);
  }
  return keys;
}

ipcMain.handle("picks:get", () => {
  const have = installedProjectKeys();
  const out = {};
  for (const [kind, list] of Object.entries(MANGO_PICKS)) {
    out[kind] = list.map((p) => ({ ...p, installed: have.has(p.id) }));
  }
  return out;
});

let picksBusy = false;
ipcMain.handle("picks:install-all", async (_e, kind) => {
  if (picksBusy) return { ok: false, error: "이미 설치하는 중이에요." };
  const list = MANGO_PICKS[kind];
  if (!list) return { ok: false };
  picksBusy = true;
  const failed = [];
  let done = 0;
  try {
    const todo = list.filter((p) => !installedProjectKeys().has(p.id));
    for (const p of todo) {
      send("picks:progress", { kind, done, total: todo.length, title: p.title });
      try {
        // 앞에서 의존 모드로 이미 깔렸으면 건너뜀
        if (!installedProjectKeys().has(p.id)) await installProject(p.id, kind);
      } catch (err) {
        failed.push(p.title);
        log(`[망고's pick] ${p.title} 설치 실패: ` + (err?.message || err));
      }
      done++;
    }
    if (kind === "shader") {
      try { await ensureShaderLoader(); } catch (_) {}
    }
    send("picks:progress", { kind, done, total: todo.length, finished: true });
    return { ok: true, installed: done - failed.length, failed };
  } finally {
    picksBusy = false;
  }
});

ipcMain.handle("neogul:install-all", async () => {
  const files = await modFiles();
  const failed = [];
  let count = 0;
  for (const m of NEOGUL_MODS) {
    const pats = re(m.patterns);
    const has = pats.every((rx) => files.some((f) => rx.test(plain(f))));
    if (has) continue;
    send("picks:progress", { kind: "neogul", title: m.name });
    try {
      // neogul:install 과 같은 길 - 핸들러를 직접 부를 수 없어서 내부 함수로
      const r = await installNeogulMod(m.id);
      if (r.ok) count++; else failed.push(m.name);
    } catch (_) {
      failed.push(m.name);
    }
  }
  return { ok: true, installed: count, failed };
});


// ─── 내 클라이언트 모드(Luna's Light) · Fabric API 자동 주입 ───────
// 노바 클라이언트와 같은 방식: 실행할 때마다 mods 폴더에 넣고, 서명한 실행 토큰을 같이 써서
// 모드가 "정식 런처로 켰다"는 걸 알게 함(토큰이 없으면 모드가 기능을 스스로 끔).
// ⚠️ 비밀값은 Luna's Light(Nova-Mod) 쪽 값과 같아야 함.
const LAUNCH_SECRET = "677ba6308331ba9b0fb83bfdb6e3a52f81e890f38343001aa9ced084e04c751e";
const BUILTIN_PREFIX = "builtin-mod-";
const MODCHECKER_NAME = "builtin-ngmodchecker.jar";
const FABRIC_API_ID = "P7dR8mSH";
const SETUP_PREFS = path.join(ROOT, "first-setup.json");

// 개발자용: %APPDATA%\Nugulient\novamod 에 jar 가 있으면 그걸 먼저 씀(모드 새로 빌드 → 바로 확인)
function builtinModSource() {
  const dirs = [path.join(ROOT, "novamod"), app.isPackaged ? path.join(process.resourcesPath, "novamod") : path.join(__dirname, "novamod")];
  for (const d of dirs) {
    try {
      const f = fs.readdirSync(d).find((n) => n.startsWith(BUILTIN_PREFIX) && n.includes(`+mc${SERVER.mcVersion}.jar`));
      if (f) return path.join(d, f);
    } catch (_) {}
  }
  return null;
}

// Luna's Light 실시간 업데이트: Nova-Mod publish.cmd 가 올리는 GitHub 릴리스 "latest" 를 실행할 때마다 확인
// (Nova Client 와 같은 곳). 바뀌었으면 %APPDATA%\Nugulient\novamod 에 받아 두고, builtinModSource() 가 그걸 먼저 씀.
const NOVA_MOD_RELEASE_URL = "https://api.github.com/repos/Sil2ntium7012/nova-mod/releases/tags/latest";

async function updateBuiltinModFromRelease() {
  const meta = store.get("novaModRelease") || {};
  try {
    const headers = { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" };
    if (meta.etag) headers["If-None-Match"] = meta.etag;
    const res = await fetch(NOVA_MOD_RELEASE_URL, { headers, timeout: 8000 });
    if (res.status === 304) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rel = await res.json();
    const v = SERVER.mcVersion;
    const asset = (rel.assets || []).find((a) => a.name.startsWith(`${BUILTIN_PREFIX}${v}-`) && (a.name.endsWith(`.mc${v}.jar`) || a.name.endsWith(`+mc${v}.jar`)));
    if (!asset) { log(`[내장 모드] 릴리스에 ${v} 용 jar 가 없음`); return; }
    const key = `rel:${asset.id}:${asset.updated_at}:${asset.size}`;
    const name = asset.name.replace(new RegExp(`\\.mc${v.replace(/\./g, "\\.")}\\.jar$`), `+mc${v}.jar`); // GitHub 이 "+" 를 "." 로 바꿈
    const dir = path.join(ROOT, "novamod");
    const dest = path.join(dir, name);
    if (meta.key === key && fs.existsSync(dest)) { store.set("novaModRelease", { ...meta, etag: res.headers.get("etag") || meta.etag }); return; }
    progress("fabric", 78, "너굴라이언트 모드 업데이트 받는 중");
    const dl = await fetch(asset.browser_download_url, { headers: { "User-Agent": USER_AGENT }, timeout: 60000 });
    if (!dl.ok) throw new Error(`받기 HTTP ${dl.status}`);
    const buf = await dl.buffer();
    if (buf.length !== asset.size) throw new Error(`크기가 달라요 (${buf.length} / ${asset.size})`);
    const digest = String(asset.digest || "");
    if (digest.startsWith("sha256:") && require("crypto").createHash("sha256").update(buf).digest("hex") !== digest.slice(7)) throw new Error("해시가 달라요");
    if (!new AdmZip(buf).getEntry("fabric.mod.json")) throw new Error("모드 jar 가 아니에요");
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(dest + ".part", buf);
    for (const f of fs.readdirSync(dir)) if (f.startsWith(BUILTIN_PREFIX) && f.endsWith(`+mc${v}.jar`) && f !== name) await fsp.rm(path.join(dir, f), { force: true });
    await fsp.rename(dest + ".part", dest);
    store.set("novaModRelease", { key, etag: res.headers.get("etag") || null, at: Date.now() });
    log(`[내장 모드] 새 버전 받음: ${name} (${asset.updated_at})`);
  } catch (err) {
    log("[내장 모드] 업데이트 확인 실패(있던 jar 사용): " + (err?.message || err));
  }
}

// 너굴마을 모드체커는 서버에서 없어진 모드. 남아 있으면 NG-SkillKeydown 이 "대기"해서 직접 지정 스킬 키가 막히므로
// 예전 버전이 넣어 둔 파일을 지움 (사람이 직접 넣은 ng-modchecker-*.jar 도 같이)
async function removeModChecker() {
  for (const f of await modFiles()) {
    if (plain(f) === MODCHECKER_NAME || /^ng-modchecker.*\.jar$/i.test(plain(f))) {
      await fsp.rm(path.join(DIRS.mod, f), { force: true });
      log("[모드체커] 없어진 모드라 지움: " + f);
    }
  }
  store.delete("modcheckerMeta");
}

// 돌려주는 값: 모드 처음 설정을 이미 했는지 (안 했으면 바로 접속하지 않음)
async function prepareBuiltinMods() {
  progress("fabric", 80, "너굴라이언트 모드 준비 중");
  // 꺼둔(.disabled) 것도 포함해서 우리 모드 옛 파일 정리
  await updateBuiltinModFromRelease();
  const files = await modFiles();
  const src = builtinModSource();
  if (src) {
    const name = path.basename(src);
    for (const f of files) if (plain(f).startsWith(BUILTIN_PREFIX) && f !== name) await fsp.rm(path.join(DIRS.mod, f), { force: true });
    await fsp.copyFile(src, path.join(DIRS.mod, name));
    setInstalledMeta(name, { title: "너굴라이언트 모드 (자동)", neogul: "client" });
  } else {
    log("[내장 모드] " + SERVER.mcVersion + " 용 jar 가 없어서 건너뜀");
  }
  await removeModChecker();
  // Luna's Light 는 Fabric API 가 있어야 켜짐
  if (!files.some((f) => /^fabric-api-.*\.jar$/i.test(f)) && !installedProjectKeys().has(FABRIC_API_ID)) {
    try { await installProject(FABRIC_API_ID, "mod"); } catch (err) { log("[Fabric API] 설치 실패: " + (err?.message || err)); }
  }
  // 모드 "처음 설정" 화면 때문에 첫 접속이 미뤄지지 않게, 기본값으로 이미 한 것처럼 채워 둠
  // (값은 망고가 노바클에서 처음 설정한 그대로. 게임 안에서 바꾸면 모드가 이 파일을 고침)
  if (!fs.existsSync(SETUP_PREFS)) {
    try {
      fs.writeFileSync(SETUP_PREFS, JSON.stringify({ font: 0, guiScale: 2, tileView: 0, hudShape: 0, mouse: 0.25, window: 2, ts: Date.now() }));
    } catch (err) {
      log("[처음 설정] 기본값 기록 실패: " + (err?.message || err));
    }
  }
}

// ─── 본인 원래 마크 설정 가져오기 (처음 한 번만) ─────────────────────────────────
// 공식 런처의 %APPDATA%\.minecraft\options.txt (조작 키 · 마우스 · 그래픽 · 언어 · 소리 …)를
// 너굴라이언트 게임 폴더로 한 번만 복사함. 여기서 게임을 한 번이라도 켰으면(= version 줄이 있으면) 안 함.
// 리소스팩 목록은 그쪽 폴더의 팩이라 빼고, 너굴라이언트에서 켠 팩 설정은 그대로 둠.
async function importOwnMinecraftOptions() {
  if (store.get("mcOptionsImported")) return;
  try {
    const mine = readOptions().filter((l) => l.trim() !== "");
    if (getOption(mine, "version") !== null) {
      store.set("mcOptionsImported", "skipped-already-played");
      return;
    }
    const src = path.join(app.getPath("appData"), ".minecraft", "options.txt");
    if (!fs.existsSync(src)) {
      store.set("mcOptionsImported", "none");
      return;
    }
    const SKIP = new Set(["resourcePacks", "incompatibleResourcePacks"]);
    const theirs = fs.readFileSync(src, "utf-8").split(/\r?\n/).filter((l) => l.includes(":") && !SKIP.has(l.slice(0, l.indexOf(":"))));
    const theirKeys = new Set(theirs.map((l) => l.slice(0, l.indexOf(":"))));
    const keepOurs = mine.filter((l) => !theirKeys.has(l.slice(0, l.indexOf(":"))));
    await fsp.writeFile(OPTIONS, [...theirs, ...keepOurs].join("\n") + "\n", "utf-8");
    store.set("mcOptionsImported", "copied");
    log(`[기본 설정] 원래 마크 설정 ${theirs.length}줄을 가져옴`);
  } catch (err) {
    log("[기본 설정] 원래 마크 설정 가져오기 실패(기본값으로 진행): " + (err?.message || err));
  }
}

// ─── 마크 기본 설정 (처음 한 번만) ─────────────────────────────────────────────
// options.txt 에 그 항목이 "없을 때만" 넣음 → 게임 안에서 한 번 바꾸면 다시는 안 건드림
// (원래 마크 설정을 가져왔으면 언어 · 소리는 이미 들어 있어서 그대로 따라감)
//   lang                 : 한국어
//   soundCategory_master : 전체 소리 50%
//   onboardAccessibility : 첫 실행 "접근성 안내" 화면 끔 (이게 뜨면 바로 접속이 막힘)
//   skipMultiplayerWarning / joinedFirstServer / tutorialStep : 첫 멀티 접속 경고 · 튜토리얼 끔
const FIRST_RUN_OPTIONS = {
  lang: "ko_kr",
  soundCategory_master: "0.5",
  joinedFirstServer: "true",
  tutorialStep: "none",
};
// 바로 접속을 막는 한 번짜리 안내 화면 - 설정이 아니라서 항상 끔
const ALWAYS_OPTIONS = {
  onboardAccessibility: "false",
  skipMultiplayerWarning: "true",
};
async function applyFirstRunOptions() {
  try {
    const lines = readOptions().filter((l) => l.trim() !== "");
    let added = 0;
    for (const [k, v] of Object.entries(FIRST_RUN_OPTIONS)) {
      if (getOption(lines, k) === null) {
        lines.push(`${k}:${v}`);
        added++;
      }
    }
    for (const [k, v] of Object.entries(ALWAYS_OPTIONS)) {
      if (getOption(lines, k) !== v) {
        setOption(lines, k, v);
        added++;
      }
    }
    if (added) {
      await fsp.writeFile(OPTIONS, lines.join("\n") + "\n", "utf-8");
      log(`[기본 설정] options.txt 에 없던 ${added}개 항목을 넣음`);
    }
  } catch (err) {
    log("[기본 설정] 실패(실행은 계속함): " + (err?.message || err));
  }
}

// 너굴마을 전용 인게임 테마 (나무 프레임 + 크림 패널 + 초록 포인트, 픽셀 느낌)
// 모드가 cosmetics.theme.mode = "neogul" 과 palette 를 읽어서 게임 안 화면을 이 색으로 그림.
// 런처 테마(보관함에서 장착한 것)는 따라가지 않음.
const NEOGUL_INGAME_THEME = {
  mode: "neogul",
  name: "너굴마을",
  pixel: true,
  palette: {
    frame: "#8a5a3b",       // 나무 프레임
    frameDark: "#5e3a24",   // 프레임 테두리 · 그림자
    frameLight: "#b07a52",  // 프레임 밝은 결
    panel: "#efe5cf",       // 크림 패널
    panelDark: "#e0d3b6",
    slot: "#a7a08f",        // 칸
    slotDark: "#8b8474",
    accent: "#6fae4f",      // 초록 포인트
    accentDark: "#4e8a35",
    text: "#4a2e1f",        // 진한 갈색 글자
    textLight: "#fff6e4",
  },
};

// 새 모드(49-259차~)는 Ed25519 서명(sig2)만 믿음. 예전 HMAC sig 는 옛 모드용으로 같이 씀.
// 개인 키는 저장소(공개)에 두지 않고, 빌드할 때 GitHub 비밀값 NOVA_SIG 로 nova-sig.json 을 만들어 넣음.
// (형 PC 의 개발 폴더에는 nova-sig.json 을 따로 둠 - .gitignore 됨)
let novaSignKeyCache;
function novaSignKey() {
  if (novaSignKeyCache !== undefined) return novaSignKeyCache;
  novaSignKeyCache = null;
  try {
    const f = path.join(__dirname, "nova-sig.json");
    if (!fs.existsSync(f)) {
      log("[노바 모드] nova-sig.json 이 없어서 새 서명(sig2)을 못 붙임 - 모드 기능이 꺼질 수 있어요");
      return null;
    }
    const { parts } = JSON.parse(fs.readFileSync(f, "utf-8"));
    const mask = crypto.createHash("sha256").update("NovaClient|launch|mask|49-259").digest();
    const raw = Buffer.from(parts.join(""), "hex");
    for (let i = 0; i < raw.length; i++) raw[i] ^= mask[i % mask.length];
    novaSignKeyCache = crypto.createPrivateKey({ key: raw, format: "der", type: "pkcs8" });
  } catch (err) {
    log("[노바 모드] 서명 키 읽기 실패: " + (err?.message || err));
  }
  return novaSignKeyCache;
}
function novaSig2(kind, ts, body) {
  const key = novaSignKey();
  if (!key) return "";
  try {
    return crypto.sign(null, Buffer.from("NovaSig|v1|" + kind + "|" + ts + "|" + (body || ""), "utf-8"), key).toString("base64");
  } catch (err) {
    log("[노바 모드] 실행 서명(sig2) 실패: " + (err?.message || err));
    return "";
  }
}

async function writeModLaunchFile(pendingServer) {
  try {
    const ts = Date.now();
    const sigFor = (prefix) => crypto.createHmac("sha256", LAUNCH_SECRET).update(prefix + ts).digest("hex");
    const prof = profileFrom(cachedAuth);
    const payload = {
      launcherVersion: APP_VERSION,
      launcher: "Nugulient",
      logoUrl: IMAGES.logo,
      activeUuid: prof.uuid || null,
      accounts: prof.uuid ? [{ uuid: prof.uuid, name: prof.name, accessToken: cachedAuth?.access_token || cachedAuth?.accessToken || null }] : [],
      // 너굴마을 전용 테마 고정 (accent 만 보는 옛 모드도 초록으로 보이게)
      cosmetics: { accent: NEOGUL_INGAME_THEME.palette.accent, theme: NEOGUL_INGAME_THEME },
      // 재접속(세션 새로고침 후 재접속) 기능 끔 - 너굴라이언트는 이 요청을 처리하지 않음
      features: { relogin: false, reconnect: false },
      setupPrefsPath: SETUP_PREFS,
      ...(pendingServer ? { pendingServer: `${SERVER.host}:${SERVER.port}`, pendingServerName: SERVER.name } : {}),
    };
    await fsp.writeFile(path.join(GAME_DIR, ".luna-launch.json"), JSON.stringify({ ts, sig: sigFor("LunaClient::"), sig2: novaSig2("launch", ts, ""), ...payload }), "utf-8");
    await fsp.writeFile(path.join(GAME_DIR, ".nova-launch.json"), JSON.stringify({ ts, sig: sigFor("NovaClient::"), ...payload }), "utf-8");
  } catch (err) {
    log("[내장 모드] 실행 토큰 기록 실패: " + (err?.message || err));
  }
}
