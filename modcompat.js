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

// jar 에서 필요한 정보만. nested = 안에 든 jar(JiJ)들의 정보(안의 안까지 펼침)
function parseModJson(zip) {
  const entry = zip.getEntry("fabric.mod.json");
  if (!entry) return null;
  const j = JSON.parse(entry.getData().toString("utf-8").replace(/[\u0000-\u001f]+/g, " "));
  // 접근 넓히개(accessWidener / classTweaker) 파일의 이름 체계. 26.x 는 "official" 이어야 하고,
  // 예전 버전용 모드는 "intermediary" 라서 게임이 켜지다가 "Failed to read classTweaker file" 로 죽음
  let awNamespace = null;
  try {
    const awFile = typeof j.accessWidener === "string" ? j.accessWidener : null;
    const awEntry = awFile ? zip.getEntry(awFile) : null;
    if (awEntry) {
      const head = awEntry.getData().slice(0, 200).toString("utf-8").split(/\r?\n/)[0].trim().split(/\s+/);
      if (/^(accessWidener|classTweaker)$/i.test(head[0] || "") && head[2]) awNamespace = head[2].toLowerCase();
    }
  } catch (_) {}
  return {
    awNamespace,
    id: String(j.id || ""),
    name: String(j.name || j.id || ""),
    version: String(j.version || ""),
    depends: j.depends && typeof j.depends === "object" ? j.depends : {},
    provides: [String(j.id || ""), ...(Array.isArray(j.provides) ? j.provides.map(String) : [])].filter(Boolean),
    jars: Array.isArray(j.jars) ? j.jars.map((n) => String(n.file || "")).filter(Boolean) : [],
  };
}
function collectNested(zip, info, out, depth) {
  if (depth > 3) return;
  for (const f of info.jars) {
    try {
      const inner = zip.getEntry(f);
      if (!inner) continue;
      const iz = new AdmZip(inner.getData());
      const ii = parseModJson(iz);
      if (!ii) continue;
      out.push({ id: ii.id, name: ii.name, depends: ii.depends, provides: ii.provides, awNamespace: ii.awNamespace });
      collectNested(iz, ii, out, depth + 1);
    } catch (_) {}
  }
}
function readMod(file) {
  try {
    const zip = new AdmZip(file);
    const info = parseModJson(zip);
    if (!info) return null;
    const nested = [];
    collectNested(zip, info, nested, 1);
    return { id: info.id, name: info.name, version: info.version, depends: info.depends, provides: info.provides, awNamespace: info.awNamespace, nested };
  } catch (_) {
    return null;
  }
}

const ALWAYS = new Set(["minecraft", "java", "fabricloader", "fabric-loader", "mixinextras"]);
// mods: [{ file, info }] (info = readMod 결과) → 켜질 수 없는 것들 [{ file, name, reason }]
//   - 게임 버전이 안 맞는 것
//   - 꼭 필요한 다른 모드가 없는 것 (연쇄 포함)
//   - 안에 든 모드(JiJ)가 켜질 수 없는데 그걸 꼭 필요로 하는 것
// opts.lenientFabric: Fabric API 가 아직 안 깔린 상태(가져오기)에서 "fabric-…" 의존은 있는 걸로 침
function findIncompatible(mods, mcVersion, opts = {}) {
  const bad = new Map();
  const mcOk = (d) => d.minecraft == null || matches(d.minecraft, mcVersion);
  // 26.x 부터 게임이 난독화 없이 나와서 이름 체계가 official 뿐임 (그 전 버전은 검사하지 않음)
  const unobf = (parseVer(mcVersion) || [0])[0] >= 26;
  const awBad = (x) => unobf && x.awNamespace && x.awNamespace !== "official";
  const depOk = (dep, have) => ALWAYS.has(dep) || have.has(dep) || (opts.lenientFabric && dep.startsWith("fabric-"));
  for (const m of mods) {
    if (!m.info) continue;
    const need = m.info.depends.minecraft;
    if (awBad(m.info)) { bad.set(m.file, { file: m.file, name: m.info.name, reason: "예전 마인크래프트 버전용 (26.x 에서 켜지지 않음)" }); continue; }
    if (!mcOk(m.info.depends)) bad.set(m.file, { file: m.file, name: m.info.name, reason: `마인크래프트 ${Array.isArray(need) ? need.join(" 또는 ") : need} 용` });
  }
  // 안에 든 모드: 게임 버전이 안 맞으면 처음부터 없는 걸로 침
  const dead = new Set(); // 켜질 수 없는 안쪽 모드 (객체)
  const why = new Map(); // 안쪽 모드 id → 이유
  for (const m of mods) for (const n of m.info?.nested || []) {
    if (awBad(n)) { dead.add(n); why.set(n.id, `안에 든 '${n.name}' 가 예전 마인크래프트 버전용`); }
    else if (!mcOk(n.depends)) { dead.add(n); why.set(n.id, `안에 든 '${n.name}' 가 마인크래프트 ${n.depends.minecraft} 용`); }
  }
  for (let round = 0; round < 12; round++) {
    const have = new Set();
    for (const m of mods) {
      if (!m.info || bad.has(m.file)) continue;
      for (const p of m.info.provides) have.add(p);
      for (const n of m.info.nested || []) if (!dead.has(n)) for (const p of n.provides) have.add(p);
    }
    let changed = false;
    for (const m of mods) {
      if (!m.info || bad.has(m.file)) continue;
      for (const n of m.info.nested || []) {
        if (dead.has(n)) continue;
        const miss = Object.keys(n.depends).find((dep) => !depOk(dep, have));
        if (miss) { dead.add(n); why.set(n.id, `안에 든 '${n.name}' 에 필요한 '${miss}' 가 없음`); changed = true; }
      }
      // Fabric 은 안에 든 모드를 그 모드의 필수 부품으로 봄: 못 켜지는데 같은 id 를 내놓는 다른 모드도 없으면 바깥 모드도 못 켜짐
      const broken = (m.info.nested || []).find((n) => dead.has(n) && n.id && !have.has(n.id));
      if (broken) {
        bad.set(m.file, { file: m.file, name: m.info.name, reason: why.get(broken.id) || `안에 든 '${broken.name}' 를 켤 수 없음` });
        changed = true;
        continue;
      }
      const miss = Object.keys(m.info.depends).find((dep) => !depOk(dep, have));
      if (miss) {
        bad.set(m.file, { file: m.file, name: m.info.name, reason: why.get(miss) || `필요한 모드 '${miss}' 가 없음` });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return [...bad.values()];
}

module.exports = { matches, readMod, findIncompatible };
