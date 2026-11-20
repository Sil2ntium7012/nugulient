// 모드 jar 가 지금 게임 버전(26.1.2 Fabric)에서 켜질 수 있는지 미리 보는 도구.
// Fabric 로더가 "호환되지 않는 모드가 있습니다" 창을 띄우고 게임이 안 켜지는 걸 막으려고,
// 가져오기 때와 PLAY 직전에 fabric.mod.json 의 depends 를 읽어서 안 맞는 모드를 걸러 냄.
// 확실히 안 맞을 때만 걸러 내고, 못 읽거나 애매하면 통과시킴.
const AdmZip = require("adm-zip");

function parseVer(v) {
  const core = String(v).trim().replace(/^[=v]+/, "").split(/[-+]/)[0];
  if (!/^\d+(\.(\d+|x|X|\*))*$/.test(core)) return null;
  return core.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : null)); // null = 와일드카드
}
function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
// 조건 하나(">=1.21.2", "~26.1", "1.21.x" …)가 version 에 맞는지. 못 읽으면 null(모름)
function matchTerm(term, ver) {
  term = term.trim();
  if (!term || term === "*") return true;
  const m = term.match(/^(>=|<=|>|<|=|~|\^)?\s*(.+)$/);
  const op = m[1] || "=";
  const hadPre = /-/.test(m[2]); // ">=26.1-" 같은 시험판 표기
  const t = parseVer(m[2]);
  if (!t) return null;
  if (t.includes(null)) { // 1.21.x
    const i = t.indexOf(null);
    return t.slice(0, i).every((n, k) => (ver[k] || 0) === n);
  }
  const c = cmp(ver, t);
  switch (op) {
    case ">=": return c >= 0;
    case ">": return c > 0 || (hadPre && c === 0);
    case "<=": return c <= 0;
    case "<": return c < 0;
    case "~": { const up = t.length >= 2 ? [t[0], t[1] + 1] : [t[0] + 1]; return c >= 0 && cmp(ver, up) < 0; }
    case "^": return c >= 0 && cmp(ver, [t[0] + 1]) < 0;
    default: return c === 0;
  }
}
// Fabric 버전 조건: 문자열(띄어쓰기 = 모두 만족) 또는 배열(하나라도 만족). 모르면 true
function matches(pred, version) {
  const ver = parseVer(version);
  if (!ver || pred == null) return true;
  const list = Array.isArray(pred) ? pred : [pred];
  if (!list.length) return true;
  let unknown = false;
  for (const p of list) {
    const terms = String(p).trim().split(/\s+/).filter(Boolean);
    let all = true;
    for (const t of terms) {
      const r = matchTerm(t, ver);
      if (r === null) { unknown = true; all = null; break; }
      if (!r) { all = false; break; }
    }
    if (all === true) return true;
  }
  return unknown; // 읽지 못한 조건이 있으면 통과
}

// jar 에서 필요한 정보만
function readMod(file) {
  try {
    const zip = new AdmZip(file);
    const entry = zip.getEntry("fabric.mod.json");
    if (!entry) return null;
    const j = JSON.parse(entry.getData().toString("utf-8").replace(/[\u0000-\u001f]+/g, " "));
    const provides = [String(j.id || ""), ...(Array.isArray(j.provides) ? j.provides.map(String) : [])].filter(Boolean);
    // 안에 든 jar(JiJ)가 내놓는 id 까지 (Fabric API 모듈 등)
    for (const n of Array.isArray(j.jars) ? j.jars : []) {
      try {
        const inner = zip.getEntry(String(n.file || ""));
        if (!inner) continue;
        const ij = JSON.parse(new AdmZip(inner.getData()).getEntry("fabric.mod.json").getData().toString("utf-8").replace(/[\u0000-\u001f]+/g, " "));
        provides.push(String(ij.id || ""), ...(Array.isArray(ij.provides) ? ij.provides.map(String) : []));
      } catch (_) {}
    }
    return { id: String(j.id || ""), name: String(j.name || j.id || ""), version: String(j.version || ""), depends: j.depends && typeof j.depends === "object" ? j.depends : {}, provides: provides.filter(Boolean) };
  } catch (_) {
    return null;
  }
}

const ALWAYS = new Set(["minecraft", "java", "fabricloader", "fabric-loader", "mixinextras"]);
// mods: [{ file, info }] (info = readMod 결과) → 켜질 수 없는 것들 [{ file, name, reason }]
// 게임 버전이 안 맞는 것, 꼭 필요한 다른 모드가 없는 것(연쇄 포함)
// opts.lenientFabric: Fabric API 가 아직 안 깔린 상태(가져오기)에서 "fabric-…" 의존은 있는 걸로 침
function findIncompatible(mods, mcVersion, opts = {}) {
  const bad = new Map();
  const alive = () => mods.filter((m) => m.info && !bad.has(m.file));
  for (const m of mods) {
    if (!m.info) continue;
    const need = m.info.depends.minecraft;
    if (need != null && !matches(need, mcVersion)) {
      bad.set(m.file, { file: m.file, name: m.info.name, reason: `마인크래프트 ${Array.isArray(need) ? need.join(" 또는 ") : need} 용` });
    }
  }
  for (let round = 0; round < 8; round++) {
    const have = new Set();
    for (const m of alive()) for (const p of m.info.provides) have.add(p);
    let changed = false;
    for (const m of alive()) {
      for (const dep of Object.keys(m.info.depends)) {
        if (ALWAYS.has(dep) || have.has(dep)) continue;
        if (opts.lenientFabric && dep.startsWith("fabric-")) continue;
        bad.set(m.file, { file: m.file, name: m.info.name, reason: `필요한 모드 '${dep}' 가 없음` });
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return [...bad.values()];
}

module.exports = { matches, readMod, findIncompatible };
