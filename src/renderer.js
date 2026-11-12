"use strict";
const api = window.nugul;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n ?? 0));

let INFO = null;
let profile = null; // { name, uuid }

// ─── 공통 ────────────────────────────────────────────────────────────────────
function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.classList.add("out"), 3200);
  setTimeout(() => el.remove(), 3500);
}

function toastAction(msg, label, fn) {
  const el = document.createElement("div");
  el.className = "toast action";
  el.innerHTML = `<span>${esc(msg)}</span><button class="btn primary sm">${esc(label)}</button><button class="toast-x" title="닫기">✕</button>`;
  $("button.btn", el).onclick = () => { fn(); el.remove(); };
  $(".toast-x", el).onclick = () => el.remove();
  $("#toasts").appendChild(el);
  return el;
}

function linkUrl(key) {
  if (!key) return null;
  if (key.startsWith("wiki:")) return `${INFO.links.wiki}#${encodeURIComponent(key.slice(5))}`;
  return INFO.links[key] || null;
}

// data-link / data-url 이 달린 버튼은 전부 외부 브라우저로
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-link],[data-url]");
  if (!el) return;
  const url = el.dataset.link ? linkUrl(el.dataset.link) : el.dataset.url.startsWith("wiki:") ? linkUrl(el.dataset.url) : el.dataset.url;
  if (url) api.openExternal(url);
});

let NUGUL_LOGO = null; // 너굴마을 모드 아이콘으로도 씀
const nugulIcon = (cls = "ng-logo") => `<img class="${cls}" src="${esc(NUGUL_LOGO || INFO?.images?.logo || "")}" alt="" />`;

// 사이트 이미지: PC 에 받아 둔 게 있으면 그걸 쓰고(인터넷 없어도 보임), 없으면 사이트에서 바로
async function setImages() {
  const imgs = (await api.images?.get?.().catch(() => null)) || INFO.images;
  NUGUL_LOGO = imgs.logo;
  $$("[data-img]").forEach((img) => {
    img.onerror = () => img.classList.add("broken");
    img.classList.remove("broken");
    img.src = imgs[img.dataset.img];
  });
  $$("[data-bg]").forEach((el) => {
    const pre = new Image();
    pre.onload = () => (el.style.backgroundImage = `url("${pre.src}")`);
    pre.src = imgs[el.dataset.bg];
  });
}
api.images?.onUpdated?.(() => setImages());

// ─── 페이지 이동 ─────────────────────────────────────────────────────────────
function showPage(name) {
  const navName = name === "calc" ? "tools" : name; // 계산기는 기능 안에 있음
  $$(".nav-item[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === navName));
  $$(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${name}`));
  if (name === "mods") refreshModsTab();
  if (name === "skin") openSkinPage();
  if (name === "inventory") renderInventory();
  if (name === "ranking") renderRanking();
  if (window.NugulTools) window.NugulTools.onPage(name);
}
$$(".nav-item[data-page]").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page)));
$("#btnMin").addEventListener("click", () => api.minimize());
$("#btnClose").addEventListener("click", () => api.close());

// ─── 계정 ────────────────────────────────────────────────────────────────────
const headUrl = (uuid) => `https://mc-heads.net/avatar/${uuid}/64`;
const DEFAULT_HEAD =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="#43382e"/><rect x="1" y="3" width="2" height="1" fill="#93846f"/><rect x="5" y="3" width="2" height="1" fill="#93846f"/></svg>');

function renderAccount() {
  const av = $("#navAvatar");
  av.onerror = () => (av.src = DEFAULT_HEAD);
  av.src = profile?.uuid ? headUrl(profile.uuid) : DEFAULT_HEAD;
  $("#navAccount").title = profile ? profile.name : "로그인";
  $("#welcome").textContent = profile ? `어서와요, ${profile.name}님!` : "어서와요!";

  const card = $("#accountCard");
  if (profile) {
    card.innerHTML = `<img src="${headUrl(profile.uuid)}" alt="" />
      <div class="who"><b>${esc(profile.name)}</b><p class="muted small">마이크로소프트 계정으로 로그인됨</p></div>
      <button class="btn ghost sm" id="accSwitch">다른 계정</button>
      <button class="btn danger sm" id="accLogout">로그아웃</button>`;
    $("#accSwitch").onclick = () => login();
    $("#accLogout").onclick = async () => {
      await api.auth.logout();
      profile = null;
      currentSkin = null;
      renderAccount();
      refreshCosmetics();
      toast("로그아웃했어요.");
    };
  } else {
    card.innerHTML = `<img src="${DEFAULT_HEAD}" alt="" />
      <div class="who"><b>로그인 안 됨</b><p class="muted small">PLAY 를 누르면 로그인 창이 떠요.</p></div>
      <button class="btn primary sm" id="accLogin">마이크로소프트 로그인</button>`;
    $("#accLogin").onclick = () => login();
  }
}

async function login() {
  const r = await api.auth.login();
  if (r.ok) {
    profile = r.profile;
    currentSkin = null;
    renderAccount();
    refreshCosmetics();
    toast(`${profile.name} 계정으로 로그인했어요.`, "ok");
    if ($("#page-skin").classList.contains("active")) openSkinPage();
    return true;
  }
  if (!r.cancelled) toast(r.error || "로그인하지 못했어요.", "err");
  return false;
}

$("#navAccount").addEventListener("click", () => openSettings("account"));

// ─── 서버 상태 ───────────────────────────────────────────────────────────────
async function refreshStatus() {
  const pill = $("#statusPill");
  try {
    const s = await api.server.status();
    pill.classList.toggle("online", s.online);
    pill.classList.toggle("offline", !s.online);
    $("#statusText").textContent = s.online ? `${s.players} / ${s.max}명 접속 중` : "서버 점검 중이거나 연결 안 됨";
    if (s.online && s.latency) $("#statusText").title = `핑 ${s.latency}ms`;
  } catch (_) {
    pill.classList.add("offline");
    $("#statusText").textContent = "상태를 확인하지 못했어요";
  }
}
$("#copyIp").addEventListener("click", async () => {
  await navigator.clipboard.writeText(INFO.server.host);
  toast("서버 주소를 복사했어요: mcng.kr", "ok");
});

// ─── 홈 컨텐츠 ───────────────────────────────────────────────────────────────
function renderContents() {
  $("#contentGrid").innerHTML = INFO.contents
    .map((c) => `<button class="cc" data-url="${esc(c.url)}"><span class="cc-tag">${esc(c.tag)}</span><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p></button>`)
    .join("");
}

// ─── PLAY ────────────────────────────────────────────────────────────────────
let running = false;
function setPlayState(state) {
  const btn = $("#playBtn");
  btn.classList.toggle("running", state === "running");
  btn.disabled = state === "launching";
  $("#playLabel").textContent = state === "running" ? "게임 실행 중 · 종료" : state === "launching" ? "준비 중" : "PLAY";
  $("#playProgress").hidden = state !== "launching";
}

$("#playBtn").addEventListener("click", async () => {
  if (running) {
    if (confirm("게임을 강제로 종료할까요? 저장되지 않은 내용이 있을 수 있어요.")) api.launch.stop();
    return;
  }
  if (!profile) {
    const ok = await login();
    if (!ok) return;
  }
  setPlayState("launching");
  $("#ppFill").style.width = "0%";
  const r = await api.launch.start();
  if (r.needLogin) {
    setPlayState("idle");
    if (await login()) $("#playBtn").click();
    return;
  }
  if (!r.ok) {
    setPlayState("idle");
    toast(r.error || "실행하지 못했어요.", "err");
  }
});

const STAGE_BASE = { java: [0, 20], fabric: [20, 25], game: [25, 98], done: [100, 100] };
api.launch.onProgress(({ stage, pct, text }) => {
  const [from, to] = STAGE_BASE[stage] || [0, 100];
  const total = Math.round(from + ((to - from) * pct) / 100);
  $("#ppText").textContent = text;
  $("#ppPct").textContent = total + "%";
  $("#ppFill").style.width = total + "%";
});
api.launch.onStarted(() => {
  running = true;
  setPlayState("running");
});
api.launch.onClosed(({ code }) => {
  running = false;
  setPlayState("idle");
  if (code && code !== 0) toast("게임이 비정상적으로 꺼졌어요. 모드를 확인해 주세요.", "err");
  refreshStatus();
});

// ─── 모드 페이지 ─────────────────────────────────────────────────────────────
let modTab = "neogul";
let installedKind = "mod";
const searchState = { kind: "mod", query: "", sort: "relevance", offset: 0 };
const KIND_LABEL = { mod: "모드", resourcepack: "리소스팩", shader: "쉐이더" };
const busy = new Map(); // projectId -> button

$$("#modTabs .tab").forEach((t) =>
  t.addEventListener("click", () => {
    modTab = t.dataset.tab;
    $$("#modTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    refreshModsTab();
  })
);

function refreshModsTab() {
  const isSearch = ["mod", "resourcepack", "shader"].includes(modTab);
  $("#tab-neogul").classList.toggle("active", modTab === "neogul");
  $("#tab-search").classList.toggle("active", isSearch);
  $("#tab-installed").classList.toggle("active", modTab === "installed");
  if (modTab === "neogul") renderNeogul();
  if (isSearch) {
    if (searchState.kind !== modTab) {
      searchState.kind = modTab;
      searchState.offset = 0;
      $("#searchInput").value = "";
      searchState.query = "";
    }
    $("#searchInput").placeholder = `${KIND_LABEL[modTab]} 검색 (예: ${modTab === "mod" ? "sodium, 미니맵" : modTab === "shader" ? "complementary, bsl" : "faithful, fresh"})`;
    doSearch();
  }
  if (modTab === "installed") renderInstalled();
  updateInstalledCount();
}

async function updateInstalledCount() {
  const [a, b, c] = await Promise.all(["mod", "resourcepack", "shader"].map((k) => api.installed.list(k)));
  $("#installedCount").textContent = a.length + b.length + c.length;
}

$("#btnOpenFolder").addEventListener("click", () => {
  const k = ["mod", "resourcepack", "shader"].includes(modTab) ? modTab : modTab === "installed" ? installedKind : "mod";
  api.openFolder(k);
});

// 너굴마을 전용
const NG_ICONS = {
  skillkeydown: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6.5" width="17" height="11" rx="2.5"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8"/></svg>',
  voice: '<svg viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>',
  koreanchat: '<svg viewBox="0 0 24 24"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8.5 9.5h3M10 9.5v3.5M14 9v4.5h1.5"/></svg>',
  quietfishing: '<svg viewBox="0 0 24 24"><path d="M4 12c2.5-3.5 6-4.5 9-3.5 2 .7 3.5 2 4.5 3.5-1 1.5-2.5 2.8-4.5 3.5-3 1-6.5 0-9-3.5z"/><path d="M17.5 12l3-3v6zM8 11.5h.01"/></svg>',
  rp: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15l4.5-4.5L13 15l2.5-2.5L20 17"/><circle cx="15" cy="8.5" r="1.5"/></svg>',
};

async function renderNeogul() {
  const grid = $("#neogulGrid");
  const data = await api.neogulMods.list();
  const allIn = data.mods.every((m) => m.installed);
  const ngAll = $("#ngInstallAll");
  ngAll.disabled = allIn;
  $("span", ngAll).textContent = allIn ? "기본 모드 모두 설치됨" : "기본 모드 모두 설치";
  renderPicks();
  grid.innerHTML =
    data.mods
      .map(
        (m) => `<div class="ng-card">
      <div class="ng-top">
        <div class="ng-icon logo">${nugulIcon()}<span class="ng-badge">${NG_ICONS[m.id] || NG_ICONS.rp}</span></div>
        <div class="grow">
          <h3>${esc(m.name)} ${m.installed ? `<span class="state ${m.enabled ? "on" : "off"}">${m.enabled ? "설치됨" : "꺼짐"}</span>` : ""}${m.update ? ' <span class="state upd">새 버전</span>' : ""}</h3>
          <p class="sub">${esc(m.sub)}</p>
        </div>
      </div>
      <p class="desc">${esc(m.desc)}</p>
      <div class="ng-actions">
        ${
          m.installed
            ? `<button class="btn ${m.update ? "primary" : "ghost"} sm" data-ng-install="${m.id}">${m.update ? "업데이트" : "다시 받기"}</button><button class="btn danger sm" data-ng-remove="${m.id}">삭제</button>`
            : `<button class="btn primary sm" data-ng-install="${m.id}">설치</button>`
        }
        <span class="grow"></span>
        <button class="link-btn" data-url="${esc(m.wiki)}">위키 설명</button>
      </div>
    </div>`
      )
      .join("") +
    `<div class="ng-card wide">
      <div class="ng-icon logo">${nugulIcon()}<span class="ng-badge">${NG_ICONS.rp}</span></div>
      <div class="grow">
        <h3>${esc(data.resourcepack.name)} ${data.resourcepack.installed ? '<span class="state on">설치됨</span>' : ""}</h3>
        <p class="sub">${esc(data.resourcepack.sub)} · ${esc(data.resourcepack.desc)}</p>
      </div>
      <button class="btn ${data.resourcepack.installed ? "ghost" : "primary"} sm" id="ngRp">${data.resourcepack.installed ? "다시 받기" : "받기"}</button>
    </div>`;

  $$("[data-ng-install]", grid).forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.textContent = "받는 중…";
      const r = await api.neogulMods.install(b.dataset.ngInstall);
      if (r.ok) toast("설치했어요. 다음 PLAY 부터 적용돼요.", "ok");
      else toast(r.error || "설치하지 못했어요.", "err");
      renderNeogul();
      updateInstalledCount();
    })
  );
  $$("[data-ng-remove]", grid).forEach((b) =>
    b.addEventListener("click", async () => {
      await api.neogulMods.remove(b.dataset.ngRemove);
      toast("삭제했어요.");
      renderNeogul();
      updateInstalledCount();
    })
  );
  $("#ngRp").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.dataset.dl = "neogul-rp";
    b.textContent = "받는 중…";
    const r = await api.neogulMods.installResourcePack();
    if (r.ok) toast("리소스팩을 받았어요. 설치됨 탭에서 적용할 수 있어요.", "ok");
    else toast(r.error || "받지 못했어요.", "err");
    renderNeogul();
  });
}

// Modrinth 검색
let searchTimer = null;
let searchSeq = 0;
$("#searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchState.query = e.target.value.trim();
    searchState.offset = 0;
    doSearch();
  }, 350);
});
$("#searchSort").addEventListener("change", (e) => {
  searchState.sort = e.target.value;
  searchState.offset = 0;
  doSearch();
});

async function doSearch() {
  const seq = ++searchSeq;
  const list = $("#resultList");
  list.innerHTML = '<div class="spinner"></div>';
  $("#pager").innerHTML = "";
  const r = await api.modrinth.search({ ...searchState });
  if (seq !== searchSeq) return;
  if (!r.ok) {
    const pin = !searchState.query && searchState.offset === 0 ? await pinnedTop(searchState.kind) : "";
    if (seq !== searchSeq) return;
    list.innerHTML = pin + `<div class="empty">검색하지 못했어요. 인터넷 연결을 확인해 주세요.</div>`;
    bindPinned(list);
    $("#searchHint").textContent = "";
    return;
  }
  $("#searchHint").textContent = `26.1.2 ${searchState.kind === "mod" ? "Fabric " : ""}${KIND_LABEL[searchState.kind]} ${r.total.toLocaleString()}개${
    searchState.kind === "shader" ? " · 쉐이더를 설치하면 필요한 Iris/Sodium 도 같이 받아요" : ""
  }`;
  if (!r.hits.length) {
    list.innerHTML = '<div class="empty">검색 결과가 없어요.</div>';
    return;
  }
  const pinned = !searchState.query && searchState.offset === 0 ? await pinnedTop(searchState.kind) : "";
  if (seq !== searchSeq) return;
  list.innerHTML = pinned + r.hits.map(resultRow).join("");
  bindResultRows(list, r.hits);
  bindPinned(list);

  const page = Math.floor(searchState.offset / 20) + 1;
  const pages = Math.ceil(r.total / 20);
  if (pages > 1) {
    $("#pager").innerHTML = `<button class="btn ghost sm" id="pgPrev" ${page <= 1 ? "disabled" : ""}>이전</button>
      <span class="muted small" style="align-self:center">${page} / ${pages}</span>
      <button class="btn ghost sm" id="pgNext" ${page >= pages ? "disabled" : ""}>다음</button>`;
    $("#pgPrev").onclick = () => { searchState.offset -= 20; doSearch(); $("#page-mods").scrollTop = 0; };
    $("#pgNext").onclick = () => { searchState.offset += 20; doSearch(); $("#page-mods").scrollTop = 0; };
  }
}

const ICON_DL = '<svg viewBox="0 0 24 24"><path d="M12 4.5v11M7.5 11L12 15.5 16.5 11M5 19.5h14"/></svg>';
const ICON_HEART = '<svg viewBox="0 0 24 24"><path d="M12 19.5s-7-4.2-7-9.3A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.2c0 5.1-7 9.3-7 9.3z"/></svg>';
const PH_ICON = '<div class="ri-icon ph"><svg viewBox="0 0 24 24"><path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/></svg></div>';

function installLabel(kind) {
  return kind === "mod" ? "설치" : "설치하고 적용";
}

function resultRow(h) {
  return `<div class="ri" data-id="${esc(h.id)}">
    ${h.icon ? `<img class="ri-icon" src="${esc(h.icon)}" alt="" loading="lazy" />` : PH_ICON}
    <div class="ri-main">
      <div class="ri-title">${esc(h.title)}${isPick(h.id, h.slug) ? PICK_TAG : ""} <small>by ${esc(h.author)}</small></div>
      <div class="ri-desc">${esc(h.desc)}</div>
      <div class="ri-meta"><span>${ICON_DL}${fmtNum(h.downloads)}</span><span>${ICON_HEART}${fmtNum(h.follows)}</span></div>
    </div>
    <div class="ri-actions">
      <button class="btn ghost sm" data-view>자세히</button>
      <button class="btn ${h.installed ? "done" : "primary"} sm" data-install>${h.installed ? "설치됨" : installLabel(searchState.kind)}</button>
    </div>
  </div>`;
}

function bindResultRows(list, hits) {
  $$(".ri:not(.pinned)", list).forEach((row, i) => {
    const h = hits[i];
    $("[data-view]", row).onclick = () => openDetail(h.id, searchState.kind, $("[data-install]", row));
    $("[data-install]", row).onclick = (e) => installFromModrinth(h.id, searchState.kind, e.currentTarget, h.installed);
  });
}

async function installFromModrinth(id, kind, btn, alreadyInstalled) {
  if (busy.has(id)) return;
  if (alreadyInstalled && !confirm("이미 설치돼 있어요. 최신 파일로 다시 받을까요?")) return;
  busy.set(id, btn);
  btn.disabled = true;
  btn.innerHTML = '받는 중 <span class="mini-pct">0%</span>';
  const r = await api.modrinth.install({ id, kind, apply: kind !== "mod" });
  busy.delete(id);
  btn.disabled = false;
  if (r.ok) {
    btn.className = "btn done sm";
    btn.textContent = "설치됨";
    const extra = r.installed.length > 1 ? ` (+ ${r.installed.slice(1).join(", ")})` : "";
    toast(`${r.installed[0]} ${kind === "mod" ? "설치 완료" : "설치하고 적용했어요"}${extra}`, "ok");
    if (r.warning) toast(r.warning, "err");
    updateInstalledCount();
  } else {
    btn.textContent = installLabel(kind);
    toast(r.error || "설치하지 못했어요.", "err");
  }
}

api.onDownloadProgress(({ id, pct }) => {
  const btn = busy.get(id);
  const pctEl = btn && $(".mini-pct", btn);
  if (pctEl) pctEl.textContent = pct + "%";
  const rpBtn = document.querySelector(`[data-dl="${id}"]`);
  if (rpBtn) rpBtn.textContent = `받는 중 ${pct}%`;
});

// 상세 보기
function mdToHtml(md) {
  // 아주 간단한 마크다운 → HTML (먼저 전부 이스케이프하고 몇 가지만 살림)
  let s = esc(md || "");
  s = s.replace(/&lt;br\s*\/?&gt;/g, "<br/>");
  s = s.replace(/!\[[^\]]*\]\((https:\/\/[^)\s]+)[^)]*\)/g, '<img src="$1" alt="" loading="lazy" />');
  s = s.replace(/&lt;img[^&]*?src=&quot;(https:\/\/[^&]+)&quot;[^&]*?\/?&gt;/g, '<img src="$1" alt="" loading="lazy" />');
  s = s.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a data-url="$2">$1</a>');
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^#{1,6}\s*(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");
  s = s.replace(/&lt;\/?[a-z][^&]*?&gt;/gi, "");
  s = s.replace(/\n{2,}/g, "<br/><br/>").replace(/\n/g, " ");
  return s;
}

async function openDetail(id, kind, rowBtn) {
  const modal = $("#detailModal");
  modal.hidden = false;
  $("#dTitle").textContent = "불러오는 중…";
  $("#dDesc").textContent = "";
  $("#dChips").innerHTML = "";
  $("#dGallery").innerHTML = "";
  $("#dBody").innerHTML = '<div class="spinner"></div>';
  $("#dIcon").src = "";
  const r = await api.modrinth.project(id);
  if (!r.ok) {
    $("#dBody").innerHTML = `<div class="empty">불러오지 못했어요.</div>`;
    return;
  }
  const p = r.project;
  $("#dIcon").src = p.icon || DEFAULT_HEAD;
  $("#dTitle").textContent = p.title;
  $("#dDesc").textContent = p.desc;
  $("#dChips").innerHTML =
    `<span class="chip">다운로드 ${fmtNum(p.downloads)}</span><span class="chip">팔로워 ${fmtNum(p.follows)}</span>` +
    (p.categories || []).slice(0, 5).map((c) => `<span class="chip">${esc(c)}</span>`).join("");
  $("#dGallery").innerHTML = p.gallery.map((g) => `<img src="${esc(g)}" alt="" loading="lazy" />`).join("");
  $("#dBody").innerHTML = mdToHtml(p.body);
  $("#dOpen").onclick = () => api.openExternal(p.url);
  const ib = $("#dInstall");
  ib.textContent = installLabel(kind);
  ib.className = "btn primary";
  ib.disabled = false;
  ib.onclick = async () => {
    await installFromModrinth(id, kind, ib, false);
    if (rowBtn && ib.textContent === "설치됨") {
      rowBtn.className = "btn done sm";
      rowBtn.textContent = "설치됨";
    }
  };
}

$$(".modal").forEach((m) =>
  m.addEventListener("mousedown", (e) => {
    if (e.target === m || e.target.closest("[data-close]")) m.hidden = true;
  })
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".modal").forEach((m) => (m.hidden = true));
});

// 설치됨
$$("#installedKind button").forEach((b) =>
  b.addEventListener("click", () => {
    installedKind = b.dataset.kind;
    $$("#installedKind button").forEach((x) => x.classList.toggle("active", x === b));
    renderInstalled();
  })
);
$("#btnAddFiles").addEventListener("click", async () => {
  const r = await api.installed.addFiles(installedKind);
  if (r.ok) {
    toast(`${r.count}개 파일을 넣었어요.`, "ok");
    renderInstalled();
    updateInstalledCount();
  }
});

async function renderInstalled() {
  const list = $("#installedList");
  const [items, state] = await Promise.all([api.installed.list(installedKind), api.apply.state()]);
  if (!items.length) {
    list.innerHTML = `<div class="empty">설치된 ${KIND_LABEL[installedKind]}가 없어요.<br/><span class="small">위쪽 탭에서 찾아서 설치해 보세요.</span></div>`;
    return;
  }
  list.innerHTML = items
    .map((it) => {
      let control = "";
      if (installedKind === "mod") {
        control = `<label class="switch" title="켜기/끄기"><input type="checkbox" data-toggle ${it.enabled ? "checked" : ""}/><span></span></label>`;
      } else if (installedKind === "resourcepack") {
        const on = state.resourcePacks.includes(it.fileName);
        control = `<button class="btn ${on ? "done" : "ghost"} sm" data-apply="${on ? "off" : "on"}">${on ? "적용됨" : "적용"}</button>`;
      } else {
        const on = state.shader === it.fileName;
        control = `<button class="btn ${on ? "done" : "ghost"} sm" data-apply="${on ? "off" : "on"}">${on ? "사용 중" : "사용"}</button>`;
      }
      const size = it.size ? `${(it.size / 1024 / 1024).toFixed(1)}MB` : "폴더";
      return `<div class="ri ${it.enabled ? "" : "disabled"}" data-file="${esc(it.fileName)}">
        ${it.neogul ? nugulIcon("ri-icon") : it.icon ? `<img class="ri-icon" src="${esc(it.icon)}" alt="" />` : PH_ICON}
        <div class="ri-main">
          <div class="ri-title">${esc(it.title)} ${it.neogul ? '<span class="state on">너굴마을</span>' : ""}${isPick(it.projectId) ? PICK_TAG : ""}</div>
          <div class="ri-desc mono">${esc(it.baseName)}</div>
          <div class="ri-meta"><span>${size}</span>${it.enabled ? "" : "<span>꺼짐</span>"}</div>
        </div>
        <div class="ri-actions">${control}<button class="btn danger sm" data-del>삭제</button></div>
      </div>`;
    })
    .join("");

  $$(".ri", list).forEach((row) => {
    const file = row.dataset.file;
    const t = $("[data-toggle]", row);
    if (t) t.onchange = async () => { await api.installed.toggle("mod", file); renderInstalled(); };
    const a = $("[data-apply]", row);
    if (a)
      a.onclick = async () => {
        const on = a.dataset.apply === "on";
        if (installedKind === "resourcepack") await api.apply.resourcepack(file, on);
        else await api.apply.shader(on ? file : null);
        toast(on ? "적용했어요. 다음 PLAY 부터 보여요." : "적용을 껐어요.", "ok");
        renderInstalled();
      };
    $("[data-del]", row).onclick = async () => {
      if (!confirm(`${file} 을(를) 삭제할까요?`)) return;
      await api.installed.remove(installedKind, file);
      renderInstalled();
      updateInstalledCount();
    };
  });
}

// ─── 스킨 ────────────────────────────────────────────────────────────────────
let viewer = null;
let currentSkin = null; // { skin, cape, variant }
let pending = null; // { path, dataUrl, name }
let variant = "classic";

function ensureViewer() {
  const canvas = $("#skinCanvas");
  const stage = canvas.parentElement;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!viewer) {
    viewer = new skinview3d.SkinViewer({ canvas, width: w, height: h });
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.zoom = 0.8;
    viewer.animation = new skinview3d.IdleAnimation();
    viewer.playerObject.rotation.y = -0.45;
  } else {
    viewer.setSize(w, h);
  }
}

function showSkin(src, v, cape) {
  ensureViewer();
  viewer.loadSkin(src, { model: v === "slim" ? "slim" : "default" });
  if (cape) viewer.loadCape(cape);
  else viewer.resetCape?.();
}

function setVariant(v) {
  variant = v;
  $$("#skinVariant button").forEach((b) => b.classList.toggle("active", b.dataset.variant === v));
  if (pending) showSkin(pending.dataUrl, v, currentSkin?.cape);
}
$$("#skinVariant button").forEach((b) => b.addEventListener("click", () => setVariant(b.dataset.variant)));

async function openSkinPage() {
  requestAnimationFrame(async () => {
    ensureViewer();
    renderRecent();
    if (!profile) {
      $("#skinEmpty").hidden = false;
      $("#skinCanvas").style.visibility = "hidden";
      return;
    }
    $("#skinEmpty").hidden = true;
    $("#skinCanvas").style.visibility = "visible";
    if (!currentSkin) {
      const r = await api.skin.current();
      if (r.ok) currentSkin = r;
      else if (r.error) toast(r.error, "err");
    }
    if (currentSkin?.skin && !pending) {
      showSkin(currentSkin.skin, currentSkin.variant, currentSkin.cape);
      setVariant(currentSkin.variant);
    }
  });
}
$("#skinLogin").addEventListener("click", () => login());

$("#skinPick").addEventListener("click", async () => {
  const r = await api.skin.pick();
  if (!r.ok) {
    if (r.error) toast(r.error, "err");
    return;
  }
  previewPending({ path: r.path, dataUrl: r.dataUrl, name: r.name });
});

function previewPending(p, v) {
  pending = p;
  if (v) setVariant(v);
  $("#skinPickLabel").textContent = p.name || "선택한 스킨";
  $("#skinStageLabel").textContent = "미리보기";
  $("#skinStageLabel").classList.add("preview");
  $("#skinApply").disabled = !profile;
  $("#skinReset").disabled = false;
  showSkin(p.dataUrl, variant, currentSkin?.cape);
}

$("#skinReset").addEventListener("click", () => {
  pending = null;
  $("#skinPickLabel").textContent = "스킨 파일 선택";
  $("#skinStageLabel").textContent = "지금 스킨";
  $("#skinStageLabel").classList.remove("preview");
  $("#skinApply").disabled = true;
  $("#skinReset").disabled = true;
  if (currentSkin?.skin) {
    setVariant(currentSkin.variant);
    showSkin(currentSkin.skin, currentSkin.variant, currentSkin.cape);
  }
});

$("#skinApply").addEventListener("click", async () => {
  if (!pending) return;
  const b = $("#skinApply");
  b.disabled = true;
  b.textContent = "바꾸는 중…";
  const r = await api.skin.upload({ filePath: pending.path, variant });
  b.textContent = "이 스킨으로 바꾸기";
  if (r.ok) {
    toast("스킨을 바꿨어요! 게임 안에서는 다시 접속하면 보여요.", "ok");
    currentSkin = { ...(currentSkin || {}), skin: pending.dataUrl, variant };
    $("#skinReset").click();
    renderRecent();
  } else {
    b.disabled = false;
    toast(r.needLogin ? "먼저 로그인해 주세요." : r.error, "err");
  }
});

// 스킨 PNG 에서 얼굴만 잘라 그림 (+ 모자 겹)
function drawHead(canvas, dataUrl) {
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    canvas.width = 8;
    canvas.height = 8;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
  };
  img.src = dataUrl;
}

async function renderRecent() {
  const box = $("#recentSkins");
  const list = await api.skin.recent();
  if (!list.length) {
    box.innerHTML = '<p class="muted small">스킨을 바꾸면 여기에 남아요.</p>';
    return;
  }
  box.innerHTML = list.map((s, i) => `<button class="rs" data-i="${i}" title="${esc(s.name)}"><canvas></canvas></button>`).join("");
  $$(".rs", box).forEach((b) => {
    const s = list[Number(b.dataset.i)];
    drawHead($("canvas", b), s.dataUrl);
    b.onclick = () => previewPending({ path: s.path, dataUrl: s.dataUrl, name: s.name }, s.variant);
  });
}

window.addEventListener("resize", () => viewer && $("#page-skin").classList.contains("active") && ensureViewer());

// ─── 위키 ────────────────────────────────────────────────────────────────────
// 홈 "위키 바로가기" - 자주 찾는 항목만 골라서
const WIKI_PICK = ["접속방법", "명령어", "마인팜", "요리", "던전 · 몬스터", "낚시 · 도감", "무역", "일반강화"];
function renderWiki() {
  const all = INFO.wikiSections.flatMap((g) => g.items);
  const picked = WIKI_PICK.map((l) => all.find((it) => it.label === l)).filter(Boolean);
  $("#wikiSections").innerHTML = picked.map((it) => `<button class="chip-btn" data-url="${esc(it.url)}">${esc(it.label)}</button>`).join("");
}

// ─── 설정 ────────────────────────────────────────────────────────────────────
function openSettings(panel = "game") {
  $("#settingsModal").hidden = false;
  if (panel === "look") renderLook();
  $$(".settings-nav button").forEach((b) => b.classList.toggle("active", b.dataset.sp === panel));
  $$(".sp").forEach((p) => p.classList.toggle("active", p.id === `sp-${panel}`));
}
$("#navSettings").addEventListener("click", () => openSettings("game"));
$$(".settings-nav button").forEach((b) => b.addEventListener("click", () => openSettings(b.dataset.sp)));
$$("[data-folder]").forEach((b) => b.addEventListener("click", () => api.openFolder(b.dataset.folder)));

async function loadSettings() {
  const s = await api.settings.get();
  fillMemQuick(s);
  SETTINGS = s;
  applyAppearance();
  const sys = await api.systemMemory();
  const max = Math.max(4, Math.min(32, sys - 2));
  $("#setMemory").max = String(max);
  $("#setMemory").value = String(Math.min(s.memoryGB, max));
  $("#setMemoryVal").textContent = `${s.memoryGB}GB`;
  $("#sysMem").textContent = `(이 PC: ${sys}GB)`;
  $("#setWidth").value = s.width;
  $("#setHeight").value = s.height;
  $("#setFullscreen").checked = s.fullscreen;
  $("#setHide").checked = s.hideOnLaunch;
}
const saveSettings = () =>
  api.settings.set({
    memoryGB: Number($("#setMemory").value),
    width: Number($("#setWidth").value),
    height: Number($("#setHeight").value),
    fullscreen: $("#setFullscreen").checked,
    hideOnLaunch: $("#setHide").checked,
  });
$("#setMemory").addEventListener("input", (e) => ($("#setMemoryVal").textContent = `${e.target.value}GB`));
["#setMemory", "#setWidth", "#setHeight", "#setFullscreen", "#setHide"].forEach((s) => $(s).addEventListener("change", saveSettings));

// ─── 시작 ────────────────────────────────────────────────────────────────────
(async function init() {
  INFO = await api.info();
  setImages();
  renderContents();
  renderWiki();
  renderRecommend();
  $("#verText").textContent = INFO.server.mcVersion;
  $("#copyIp").textContent = INFO.server.host;
  $("#appVersion").textContent = `너굴라이언트 ${INFO.version}`;
  setupUpdateUi();
  $("#gameDirText").textContent = INFO.gameDir;
  loadSettings();
  renderAccount();
  refreshStatus();
  setInterval(refreshStatus, 60_000);
  updateInstalledCount();

  const st = await api.launch.status();
  if (st.running) {
    running = true;
    setPlayState("running");
  }

  const a = await api.auth.init();
  if (a.ok) {
    profile = a.profile;
    renderAccount();
    refreshCosmetics(true);
    if (a.source === "nova") toast(`노바 클라이언트 로그인 기록으로 ${profile.name} 계정에 자동 로그인했어요.`, "ok");
  } else {
    refreshCosmetics();
    if (a.lastName) toast(`${a.lastName} 계정 로그인이 만료됐어요. PLAY 를 누르면 다시 로그인해요.`);
  }
})();

// ─── 화면 테마 · 폰트 적용 ───────────────────────────────────────────────────
const C = window.COSMETICS;
let SETTINGS = {};
let CSTATE = null;

const hexRgb = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbHex = (r) => "#" + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => {
  const x = hexRgb(a), y = hexRgb(b);
  return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
};
const lum = (h) => {
  const [r, g, b] = hexRgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function applyAppearance() {
  const theme = CSTATE?.equippedTheme ? C.byId(CSTATE.equippedTheme) : null;
  let vars, scheme;
  if (theme) {
    vars = { ...theme.vars };
    scheme = theme.scheme;
  } else {
    const base = C.BASE_MODES[SETTINGS.baseMode] || C.BASE_MODES.gray;
    vars = { ...base.vars };
    scheme = base.scheme;
    const col = C.byId(CSTATE?.equippedColor) || C.byId("nugul-orange");
    let a = col.hex;
    const light = scheme === "light";
    // 바탕에 묻히는 색은 조금 진하게/밝게 보정해서 글자·버튼이 보이게
    if (light && lum(a) > 0.6) a = mix(a, "#000000", 0.4);
    if (!light && lum(a) < 0.06) a = mix(a, "#ffffff", 0.45);
    vars.accent = a;
    vars["accent-strong"] = light ? mix(a, "#000000", 0.14) : mix(a, "#ffffff", 0.22);
    vars["accent-dim"] = mix(a, vars["bg-1"], 0.55);
    vars["accent-ink"] = lum(a) > 0.4 ? "#1a1206" : "#ffffff";
  }
  vars["bg-4"] = mix(vars["bg-3"], vars["text-0"], 0.1);
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) root.setProperty(`--${k}`, v);
  root.setProperty("color-scheme", scheme);
  document.body.dataset.scheme = scheme;
  root.setProperty("--font", (C.FONTS[SETTINGS.font] || C.FONTS.suit).css);
  root.setProperty("--font-size", `${SETTINGS.fontSize || 14}px`);
}

async function refreshCosmetics(first = false) {
  CSTATE = await api.cosmetics.state();
  applyAppearance();
  $("#pullDot").hidden = !CSTATE.canPull;
  if (CSTATE.tampered) {
    toastAction("저장 파일을 고친 흔적이 있어서 보관함과 로그인 정보를 초기화했어요.", "확인", () => {});
  }
  if (CSTATE.imported?.length) {
    toast(`노바 클라이언트 보관함에서 ${CSTATE.imported.length}개를 가져왔어요.`, "ok");
  }
  if ($("#page-inventory").classList.contains("active")) renderInventory();
  if (!$("#settingsModal").hidden) renderLook();
}

// ─── 보관함 · 뽑기 · 도감 ────────────────────────────────────────────────────
let invTab = "gacha";
let dexFilter = "all";
let lastPulled = null;

$$("#invTabs .tab").forEach((t) =>
  t.addEventListener("click", () => {
    invTab = t.dataset.inv;
    $$("#invTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".inv-panel").forEach((p) => p.classList.toggle("active", p.id === `inv-${invTab}`));
    renderInventory();
  })
);
$$("#dexFilter button").forEach((b) =>
  b.addEventListener("click", () => {
    dexFilter = b.dataset.f;
    $$("#dexFilter button").forEach((x) => x.classList.toggle("active", x === b));
    renderDex();
  })
);

const CHECK = '<span class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';

function themePreview(vars) {
  return `<div class="tp" style="--tp-bg0:${vars["bg-0"]};--tp-bg1:${vars["bg-1"]};--tp-bg2:${vars["bg-3"]};--tp-accent:${vars.accent};--tp-text:${vars["text-0"]}">
    <div class="tp-side"><i></i><i></i><i></i></div>
    <div class="tp-main"><div class="tp-line"></div><div class="tp-hero"></div></div>
  </div>`;
}
function itemArt(item) {
  if (item.kind === "theme") return themePreview(item.vars);
  return `<div class="sw" style="background:${item.hex};--sw:${item.hex}"></div>`;
}
const rarityOf = (item) => C.RARITY[item.rarity];

function fmtLeft(ms) {
  const h = Math.max(0, Math.ceil(ms / 3600000));
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}일 ${h % 24}시간` : `${h}시간`;
}
const fmtDate = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

function renderInventory() {
  if (!CSTATE) return;
  const total = C.ITEMS.length;
  const ownedCount = Object.keys(CSTATE.owned).filter((id) => C.byId(id)).length;
  $("#dexCount").textContent = `${ownedCount}/${total}`;
  $("#btnImportNova").hidden = !(CSTATE.loggedIn && CSTATE.novaFound);
  if (invTab === "gacha") renderGacha();
  if (invTab === "owned") renderOwned();
  if (invTab === "dex") renderDex();
}

function setGachaFront(item, isNew, count) {
  const r = rarityOf(item);
  $("#gachaStage").style.setProperty("--glow", r.color);
  $("#gachaFront").style.setProperty("--rar", r.color);
  $("#gachaFront").innerHTML = `${isNew ? '<span class="gc-new">NEW</span>' : `<span class="gc-dup">×${count}</span>`}
    <span class="rar">${r.label.toUpperCase()}</span>
    ${itemArt(item)}
    <h3>${esc(item.name)}</h3>
    <p>${item.kind === "theme" ? esc(item.desc || "테마") : "포인트 색상"}</p>`;
}

function renderGacha() {
  const card = $("#gachaCard"), stage = $("#gachaStage");
  const btn = $("#btnPull"), equipBtn = $("#btnEquipPulled");
  const weights = Object.values(C.RARITY).reduce((a, r) => a + r.weight, 0);
  $("#gachaRates").innerHTML = Object.entries(C.RARITY)
    .filter(([, r]) => r.weight)
    .map(([key, r]) => {
      const n = C.ITEMS.filter((i) => i.rarity === key).length;
      return `<span class="rate"><i style="background:${r.color}"></i>${r.label} ${Math.round((r.weight / weights) * 100)}% <span>· ${n}종</span></span>`;
    })
    .join("");


  if (!CSTATE.loggedIn) {
    card.className = "gacha-card";
    stage.classList.remove("revealed");
    $("#gachaKicker").textContent = "이번 주 뽑기";
    $("#gachaTitle").textContent = "로그인하면 뽑을 수 있어요";
    $("#gachaSub").textContent = "뽑기 기록과 도감은 마크 계정마다 이 PC에 저장돼요.";
    btn.textContent = "로그인";
    btn.disabled = false;
    btn.onclick = () => login();
    equipBtn.hidden = true;
    return;
  }

  if (CSTATE.canPull) {
    card.className = "gacha-card";
    stage.classList.remove("revealed");
    $("#gachaKicker").textContent = "이번 주 뽑기";
    $("#gachaTitle").textContent = "뽑기 1회가 기다리고 있어요";
    $("#gachaSub").textContent = `색상이나 테마 중 하나가 나와요. 이번 주가 끝나기까지 ${fmtLeft(CSTATE.nextResetAt - Date.now())}.`;
    btn.textContent = "뽑기";
    btn.disabled = false;
    btn.onclick = doPull;
    equipBtn.hidden = true;
  } else {
    const last = lastPulled || CSTATE.lastPull;
    const item = last && C.byId(last.id);
    if (item) {
      setGachaFront(item, last.isNew, CSTATE.owned[item.id]?.count || 1);
      card.className = "gacha-card flipped";
      stage.classList.add("revealed");
      $("#gachaKicker").textContent = "이번 주에 뽑은 것";
      $("#gachaTitle").textContent = `${item.name} ${last.isNew ? "획득!" : "(이미 있던 거예요)"}`;
      showEquipButton(item);
    }
    $("#gachaSub").textContent = `다음 뽑기까지 ${fmtLeft(CSTATE.nextResetAt - Date.now())} 남았어요. (매주 월요일 0시)`;
    btn.textContent = "다음 주에 또 만나요";
    btn.disabled = true;
  }
}

function showEquipButton(item) {
  const equipBtn = $("#btnEquipPulled");
  const equipped = item.kind === "theme" ? CSTATE.equippedTheme === item.id : CSTATE.equippedColor === item.id && !CSTATE.equippedTheme;
  equipBtn.hidden = false;
  equipBtn.disabled = equipped;
  equipBtn.textContent = equipped ? "장착 중" : "바로 장착";
  equipBtn.onclick = () => equip(item.kind, item.id);
}

async function doPull() {
  const btn = $("#btnPull");
  btn.disabled = true;
  const card = $("#gachaCard");
  card.className = "gacha-card shake";
  const [r] = await Promise.all([api.cosmetics.pull(), new Promise((res) => setTimeout(res, 950))]);
  if (!r.ok) {
    card.className = "gacha-card";
    btn.disabled = false;
    if (r.needLogin) login();
    else toast(r.error || "뽑지 못했어요.", "err");
    return;
  }
  const item = C.byId(r.id);
  lastPulled = { id: r.id, isNew: r.isNew };
  CSTATE = r.state;
  setGachaFront(item, r.isNew, r.count);
  card.className = "gacha-card flipped";
  $("#gachaStage").classList.add("revealed");
  setTimeout(() => {
    $("#pullDot").hidden = true;
    renderInventory();
  }, 750);
  toast(r.isNew ? `${rarityOf(item).label} ${item.name}을(를) 도감에 새로 등록했어요!` : `${item.name}이(가) 또 나왔어요 (×${r.count})`, "ok");
}

async function equip(kind, id) {
  const r = await api.cosmetics.equip(kind, id);
  if (!r.ok) {
    if (r.needLogin) login();
    else toast(r.error, "err");
    return;
  }
  CSTATE = { ...CSTATE, ...r.state };
  applyAppearance();
  renderInventory();
  if (!$("#settingsModal").hidden) renderLook();
}

function renderOwned() {
  const owned = Object.keys(CSTATE.owned).map(C.byId).filter(Boolean);
  const themes = owned.filter((i) => i.kind === "theme");
  const colors = C.ITEMS.filter((i) => i.kind === "color" && CSTATE.owned[i.id]);
  const baseVars = { ...(C.BASE_MODES[SETTINGS.baseMode] || C.BASE_MODES.gray).vars, accent: (C.byId(CSTATE.equippedColor) || C.byId("nugul-orange")).hex };

  $("#ownedThemes").innerHTML =
    `<button class="item ${!CSTATE.equippedTheme ? "on" : ""}" data-theme="">
      ${!CSTATE.equippedTheme ? CHECK : ""}${themePreview(baseVars)}
      <div class="meta"><b>기본 바탕</b><span>${(C.BASE_MODES[SETTINGS.baseMode] || C.BASE_MODES.gray).name}</span></div>
    </button>` +
    themes
      .map((t) => {
        const on = CSTATE.equippedTheme === t.id;
        const r = rarityOf(t);
        return `<button class="item ${on ? "on" : ""}" data-theme="${t.id}">${on ? CHECK : ""}${themePreview(t.vars)}
          <div class="meta"><b>${esc(t.name)}</b><small style="color:${r.color}">${r.label}</small></div></button>`;
      })
      .join("") +
    (themes.length ? "" : `<div class="muted small" style="align-self:center;padding:10px">아직 테마가 없어요. 뽑기에서 에픽·레전더리로 나와요.</div>`);

  $("#ownedColors").innerHTML = colors
    .map((c) => {
      const on = CSTATE.equippedColor === c.id;
      const r = rarityOf(c);
      return `<button class="item ${on ? "on" : ""}" data-color="${c.id}">${on ? CHECK : ""}<div class="sw" style="background:${c.hex}"></div>
        <div class="meta"><b>${esc(c.name)}</b><small style="color:${r.color}">${r.label}</small></div></button>`;
    })
    .join("");

  $$("[data-theme]", $("#ownedThemes")).forEach((b) => (b.onclick = () => equip("theme", b.dataset.theme || null)));
  $$("[data-color]", $("#ownedColors")).forEach((b) => (b.onclick = () => equip("color", b.dataset.color)));
}

function renderDex() {
  const total = C.ITEMS.length;
  const ownedCount = C.ITEMS.filter((i) => CSTATE.owned[i.id]).length;
  const pct = Math.round((ownedCount / total) * 100);
  $("#dexFill").style.width = pct + "%";
  $("#dexPct").textContent = pct + "%";
  // 테마 먼저, 같은 종류 안에서는 희귀한 순
  const order = { legendary: 0, epic: 1, rare: 2, common: 3, base: 4 };
  const list = C.ITEMS.map((it, i) => ({ it, no: i + 1 }))
    .filter(({ it }) => dexFilter === "all" || it.kind === dexFilter)
    .sort((a, b) => (a.it.kind === b.it.kind ? 0 : a.it.kind === "theme" ? -1 : 1) || order[a.it.rarity] - order[b.it.rarity] || a.no - b.no);
  $("#dexGrid").innerHTML = list
    .map(({ it, no }) => {
      const o = CSTATE.owned[it.id];
      const r = rarityOf(it);
      const num = `No.${String(no).padStart(2, "0")}`;
      if (!o) {
        return `<div class="dx locked" style="--rar:${r.color}"><span class="no">${num}</span><div class="art">?</div>
          <b>???</b><small>${r.label} ${it.kind === "theme" ? "테마" : "색상"}</small></div>`;
      }
      const from = o.from === "뽑기" ? `${fmtDate(o.at)} 뽑기` : o.from;
      return `<div class="dx" style="--rar:${r.color}"><span class="no">${num}</span><div class="art">${itemArt(it)}</div>
        <b>${esc(it.name)}</b><small>${r.label}${o.count > 1 ? ` · ×${o.count}` : ""}</small><span class="from">${esc(from)}</span></div>`;
    })
    .join("");
}

$("#btnImportNova").addEventListener("click", async () => {
  const r = await api.cosmetics.importNova();
  if (!r.ok) return toast(r.error, "err");
  toast(r.added.length ? `노바클에서 ${r.added.length}개를 더 가져왔어요.` : "노바클에 있는 건 이미 다 가져왔어요.", "ok");
  refreshCosmetics();
});

// ─── 설정 > 화면 ─────────────────────────────────────────────────────────────
$("#setFont").innerHTML = Object.entries(C.FONTS).map(([k, f]) => `<option value="${k}">${esc(f.name)}</option>`).join("");
$("#setFont").addEventListener("change", async (e) => {
  SETTINGS = await api.settings.set({ font: e.target.value });
  applyAppearance();
});
$$("#setBase button").forEach((b) =>
  b.addEventListener("click", async () => {
    SETTINGS = await api.settings.set({ baseMode: b.dataset.base });
    applyAppearance();
    renderLook();
  })
);
$$("#setFontSize button").forEach((b) =>
  b.addEventListener("click", async () => {
    SETTINGS = await api.settings.set({ fontSize: Number(b.dataset.size) });
    applyAppearance();
    renderLook();
  })
);

function renderLook() {
  if (!CSTATE) return;
  $$("#setBase button").forEach((b) => b.classList.toggle("active", b.dataset.base === (SETTINGS.baseMode || "gray")));
  $$("#setFontSize button").forEach((b) => b.classList.toggle("active", Number(b.dataset.size) === (SETTINGS.fontSize || 14)));
  $("#setFont").value = SETTINGS.font || "suit";
  const theme = CSTATE.equippedTheme && C.byId(CSTATE.equippedTheme);
  $("#lookThemeNote").innerHTML = theme
    ? `지금 <b>${esc(theme.name)}</b> 테마를 쓰는 중이라 바탕·색은 테마를 빼야 보여요. <button class="link-btn" id="lookUnequip">테마 빼기</button>`
    : "테마를 장착하지 않았을 때 쓰는 바탕이에요";
  const un = $("#lookUnequip");
  if (un) un.onclick = () => equip("theme", null);
  const colors = C.ITEMS.filter((i) => i.kind === "color" && CSTATE.owned[i.id]);
  const lockedCount = C.ITEMS.filter((i) => i.kind === "color").length - colors.length;
  $("#setColors").innerHTML =
    colors
      .map((c) => `<button class="swatch-btn ${CSTATE.equippedColor === c.id ? "on" : ""}" data-c="${c.id}" title="${esc(c.name)}" style="background:${c.hex}"></button>`)
      .join("") + (lockedCount ? `<button class="swatch-more" id="lookMore">+ ${lockedCount}색은 뽑기로 얻어요</button>` : "");
  $$("#setColors [data-c]").forEach((b) => (b.onclick = () => equip("color", b.dataset.c)));
  const more = $("#lookMore");
  if (more) more.onclick = () => {
    $("#settingsModal").hidden = true;
    showPage("inventory");
  };
}

// ─── 자동 업데이트 ───────────────────────────────────────────────────────────
let updateToast = null;
function onUpdateState(st) {
  $("#btnUpdateInstall").hidden = st.status !== "ready";
  const v = $("#appVersion");
  const base = `너굴라이언트 ${INFO.version}`;
  v.textContent =
    st.status === "downloading" ? `${base} · 새 버전 ${st.version || ""} 받는 중 ${st.pct ?? 0}%` :
    st.status === "ready" ? `${base} · 새 버전 ${st.version} 준비 완료` :
    st.status === "none" ? `${base} · 최신 버전이에요` :
    st.status === "checking" ? `${base} · 확인 중…` : base;
  if (st.status === "ready" && !updateToast) {
    updateToast = toastAction(`새 버전 ${st.version} 이 준비됐어요.`, "재시작해서 업데이트", installUpdate);
  }
}
async function installUpdate() {
  const r = await api.update.install();
  if (!r.ok) toast(r.error, "err");
}
async function setupUpdateUi() {
  api.update.onState(onUpdateState);
  onUpdateState(await api.update.state());
  $("#btnUpdateInstall").onclick = installUpdate;
  $("#btnUpdateCheck").onclick = async () => {
    const r = await api.update.check();
    if (!r.ok) toast(r.error, "err");
  };
}

// 뽑기 남은 시간 표시를 가끔 새로 고침 (월요일 0시가 지나면 빨간 점도 다시 뜸)
setInterval(() => {
  if (!CSTATE) return;
  if (CSTATE.nextResetAt && Date.now() > CSTATE.nextResetAt) refreshCosmetics();
  else if ($("#page-inventory").classList.contains("active") && invTab === "gacha") renderGacha();
}, 60_000);


// ─── 랭킹 ────────────────────────────────────────────────────────────────────
let RANK = null;
let rankTab = "level";
const RANK_TABS = [
  { key: "level", icon: "⭐", label: "레벨" },
  { key: "fame", icon: "❤️", label: "인기도" },
  { key: "island", icon: "🏝️", label: "섬 순위" },
  { key: "money", icon: "💰", label: "돈" },
  { key: "fishing", icon: "🎣", label: "낚시" },
  { key: "shipment", icon: "🚢", label: "무역" },
  { key: "playtime", icon: "⏰", label: "플레이타임" },
  { key: "adopt", icon: "💬", label: "질문 채택" },
  { key: "first", icon: "🏅", label: "최초 달성" },
];
const FIRST_LABELS = {
  farm: { icon: "🌾", title: "최고의 농부", goal: "농사 레벨 100 달성" },
  fish: { icon: "🐟", title: "최고의 낚시꾼", goal: "낚시 레벨 100 달성" },
  mine: { icon: "⛏️", title: "최고의 광부", goal: "채광 레벨 100 달성" },
  combat: { icon: "⚔️", title: "최고의 사냥꾼", goal: "토벌 레벨 100 달성" },
};
const fmtInt = (n) => Number(n || 0).toLocaleString("ko-KR");
function fmtPlay(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${fmtInt(h)}시간 ${m}분` : `${m}분`;
}
// 항목마다 값 필드 이름이 달라서 아는 것부터 꺼냄
function rankValue(key, row) {
  if (row.level != null) return { main: `Lv.${row.level}`, sub: row.exp != null ? `${fmtInt(row.exp)} exp` : "" };
  if (row.seconds != null) return { main: fmtPlay(row.seconds), sub: "" };
  const n = row.amount ?? row.count ?? row.score ?? row.points ?? row.value ?? Object.values(row).find((v) => typeof v === "number");
  const unit = { fame: "", money: "", fishing: "마리", adopt: "회" }[key] ?? "";
  return { main: `${fmtInt(n)}${unit}`, sub: "" };
}
const rowName = (row) => row.name ?? row.island ?? row.owner ?? "?";

function renderRankTabs() {
  $("#rankTabs").innerHTML = RANK_TABS.map((t) => `<button class="tab ${t.key === rankTab ? "active" : ""}" data-rk="${t.key}">${t.icon} ${t.label}</button>`).join("");
  $$("#rankTabs .tab").forEach((b) => (b.onclick = () => { rankTab = b.dataset.rk; renderRanking(); }));
}

function renderRanking() {
  renderRankTabs();
  const body = $("#rankBody");
  if (!RANK?.data) {
    $("#rankSub").textContent = RANK?.error ? "랭킹을 받아오지 못했어요. 인터넷 연결을 확인해 주세요." : "불러오는 중…";
    body.innerHTML = RANK?.error ? '<div class="empty">아직 받아온 랭킹이 없어요.</div>' : '<div class="spinner"></div>';
    return;
  }
  const d = RANK.data;
  const ago = Math.max(0, Math.round((Date.now() - RANK.fetchedAt) / 60000));
  $("#rankSub").textContent = `사이트 기준 ${d.updated} 갱신 · ${ago < 1 ? "방금" : ago < 60 ? `${ago}분 전` : `${Math.floor(ago / 60)}시간 전`}에 받아옴 (2시간마다 자동)` + (RANK.error ? " · 최근 받기 실패" : "");
  const me = (profile?.name || "").toLowerCase();

  if (rankTab === "first") {
    body.innerHTML = `<div class="first-grid">${Object.entries(d.first_level || {})
      .map(([k, v]) => {
        const L = FIRST_LABELS[k] || { icon: "🏅", title: k, goal: "" };
        const rows = v.rows || [];
        return `<div class="first-card ${v.achieved ? "done" : ""}">
          <div class="first-head"><span class="first-icon">${L.icon}</span><div><b>${esc(L.title)}</b><p class="muted small">${esc(L.goal)}</p></div>
          <span class="state ${v.achieved ? "on" : "off"}">${v.achieved ? "달성" : "도전 중"}</span></div>
          ${rows.map((r, i) => `<div class="first-row ${String(r.name).toLowerCase() === me ? "me" : ""}">
              <span class="fr-rank">${i + 1}</span><span class="fr-name">${esc(r.name)}</span>
              <div class="fr-bar"><i style="width:${Math.min(100, r.level)}%"></i></div><span class="fr-lv">Lv.${r.level}</span></div>`).join("")}
        </div>`;
      })
      .join("")}</div>`;
    return;
  }

  const rows = Array.isArray(d[rankTab]) ? d[rankTab] : [];
  if (!rows.length) {
    body.innerHTML = '<div class="empty">아직 순위가 없어요.</div>';
    return;
  }
  const medal = ["🥇", "🥈", "🥉"];
  const podium = rows.slice(0, 3).map((r, i) => {
    const v = rankValue(rankTab, r);
    return `<div class="podium p${i + 1} ${String(rowName(r)).toLowerCase() === me ? "me" : ""}">
      <span class="pd-medal">${medal[i]}</span><b>${esc(rowName(r))}</b><span class="pd-val">${esc(v.main)}</span>${v.sub ? `<span class="pd-sub">${esc(v.sub)}</span>` : ""}</div>`;
  });
  const mine = rows.findIndex((r) => String(rowName(r)).toLowerCase() === me);
  body.innerHTML = `
    ${mine >= 0 ? `<div class="notice rank-me">🎉 ${esc(profile.name)}님은 지금 <b>${mine + 1}위</b>예요!</div>` : ""}
    <div class="podiums">${[podium[1] || "", podium[0], podium[2] || ""].join("")}</div>
    <div class="rank-list">${rows.slice(3).map((r, i) => {
      const v = rankValue(rankTab, r);
      return `<div class="rank-row ${String(rowName(r)).toLowerCase() === me ? "me" : ""}"><span class="rr-no">${i + 4}</span><span class="rr-name">${esc(rowName(r))}</span>${v.sub ? `<span class="rr-sub">${esc(v.sub)}</span>` : ""}<span class="rr-val">${esc(v.main)}</span></div>`;
    }).join("")}</div>`;
}

$("#rankRefresh").addEventListener("click", async () => {
  const b = $("#rankRefresh");
  b.disabled = true;
  RANK = await api.rank.refresh();
  b.disabled = false;
  if (RANK.error) toast("랭킹을 받아오지 못했어요.", "err");
  else toast("랭킹을 새로 받아왔어요.", "ok");
  renderRanking();
});
api.rank.onData((r) => {
  RANK = r;
  if ($("#page-ranking").classList.contains("active")) renderRanking();
});
// ─── 너굴마을 모드 업데이트 알림 (새 버전이 위키에 올라오면 버튼 하나로) ─────────
let ngUpdToast = null;
async function updateNeogulAll() {
  toast("너굴마을 모드 업데이트 받는 중…");
  const r = await api.neogulMods.updateAll();
  if (!r.ok) return toast(r.error || "업데이트하지 못했어요.", "err");
  if (r.failed?.length) toast(`업데이트 실패: ${r.failed.join(", ")}`, "err");
  else toast(`너굴마을 모드 ${r.updated}개를 업데이트했어요. 다음 PLAY 부터 적용돼요.`, "ok");
}
function showNeogulUpdates(list) {
  if (ngUpdToast) { ngUpdToast.remove(); ngUpdToast = null; }
  if (list?.length) ngUpdToast = toastAction(`너굴마을 모드 새 버전: ${list.map((u) => u.name).join(", ")}`, "한 번에 업데이트", updateNeogulAll);
  if ($("#page-mods").classList.contains("active") && typeof renderNeogul === "function") renderNeogul();
}
api.neogulMods.onUpdates(showNeogulUpdates);
api.neogulMods.updates().then((l) => l?.length && showNeogulUpdates(l)).catch(() => {});

api.onNeogulUpdated(() => {
  if ($("#page-mods").classList.contains("active") && typeof renderNeogul === "function") renderNeogul();
});
api.rank.get().then((r) => (RANK = r));


// ─── 망고's pick ─────────────────────────────────────────────────────────────
const PICK_TAG = '<span class="pick-tag">망고\'s pick</span>';
let PICKS = null; // { mod: [{id,title,icon,installed}], resourcepack, shader }
let PICK_KEYS = new Set();
const isPick = (...keys) => keys.some((k) => k && PICK_KEYS.has(k));

async function loadPicks() {
  PICKS = await api.picks.get();
  PICK_KEYS = new Set(Object.values(PICKS).flat().map((p) => p.id));
  return PICKS;
}

function pickRow(p, kind) {
  return `<div class="ri pinned" data-pick="${esc(p.id)}" data-kind="${kind}">
    ${p.icon ? `<img class="ri-icon" src="${esc(p.icon)}" alt="" loading="lazy" />` : PH_ICON}
    <div class="ri-main"><div class="ri-title">${esc(p.title)}${PICK_TAG}</div></div>
    <div class="ri-actions">
      <button class="btn ghost sm" data-view>자세히</button>
      <button class="btn ${p.installed ? "done" : "primary"} sm" data-install>${p.installed ? "설치됨" : installLabel(kind)}</button>
    </div></div>`;
}
function bindPickRows(root) {
  $$(".ri[data-pick]", root).forEach((row) => {
    const id = row.dataset.pick, kind = row.dataset.kind;
    const btn = $("[data-install]", row);
    $("[data-view]", row).onclick = () => openDetail(id, kind, btn);
    btn.onclick = async () => {
      await installFromModrinth(id, kind, btn, btn.textContent === "설치됨");
      loadPicks();
    };
  });
}

const PICK_KIND_LABEL = { mod: "모드", resourcepack: "리소스팩", shader: "쉐이더" };
async function renderPicks() {
  const box = $("#picksBox");
  if (!box) return;
  await loadPicks();
  box.innerHTML = ["mod", "resourcepack", "shader"]
    .map((kind) => {
      const list = PICKS[kind] || [];
      const left = list.filter((p) => !p.installed).length;
      return `<div class="pick-group">
        <div class="pick-group-head"><h3>${PICK_KIND_LABEL[kind]} <span class="badge">${list.length}</span></h3>
          <button class="btn ${left ? "primary" : "done"} sm" data-pick-all="${kind}" ${left ? "" : "disabled"}>${left ? `${left}개 모두 설치` : "모두 설치됨"}</button></div>
        <div class="result-list">${list.map((p) => pickRow(p, kind)).join("")}</div>
      </div>`;
    })
    .join("");
  bindPickRows(box);
  $$("[data-pick-all]", box).forEach((b) =>
    b.addEventListener("click", async () => {
      const kind = b.dataset.pickAll;
      b.disabled = true;
      b.textContent = "준비 중…";
      b.dataset.progress = kind;
      const r = await api.picks.installAll(kind);
      if (!r.ok) toast(r.error || "설치하지 못했어요.", "err");
      else if (r.failed.length) toast(`${r.installed}개 설치, ${r.failed.length}개 실패 (${r.failed.slice(0, 3).join(", ")}${r.failed.length > 3 ? " 외" : ""})`, "err");
      else toast(`망고's pick ${PICK_KIND_LABEL[kind]} ${r.installed}개를 설치했어요.`, "ok");
      renderPicks();
      updateInstalledCount();
    })
  );
}

api.picks.onProgress(({ kind, done, total, title, finished }) => {
  if (kind === "neogul") {
    const b = $("#ngInstallAll span");
    if (b) b.textContent = `${title} 받는 중…`;
    return;
  }
  const b = document.querySelector(`[data-progress="${kind}"]`);
  if (b && !finished) b.textContent = `${done + 1}/${total} ${title}`;
});

$("#ngInstallAll").addEventListener("click", async () => {
  const b = $("#ngInstallAll");
  b.disabled = true;
  const r = await api.neogulMods.installAll();
  if (r.failed.length) toast(`설치하지 못한 모드: ${r.failed.join(", ")}`, "err");
  else toast(r.installed ? `너굴마을 기본 모드 ${r.installed}개를 설치했어요.` : "이미 다 설치돼 있어요.", "ok");
  renderNeogul();
  updateInstalledCount();
});

// 모드/리소스팩/쉐이더 탭 맨 위: (모드 탭이면) 너굴마을 기본 모드 + 망고's pick
async function pinnedTop(kind) {
  if (!PICKS) await loadPicks();
  let html = "";
  if (kind === "mod") {
    const ng = await api.neogulMods.list();
    html += `<div class="pin-head"><b>너굴마을 기본 모드</b><button class="link-btn" data-goto-rec>추천 탭에서 한 번에 설치</button></div>` +
      ng.mods.map((m) => `<div class="ri pinned" data-ng="${m.id}">${nugulIcon("ri-icon")}
        <div class="ri-main"><div class="ri-title">${esc(m.name)} <span class="state on">너굴마을</span></div><div class="ri-desc">${esc(m.sub)} · ${esc(m.desc)}</div></div>
        <div class="ri-actions"><button class="btn ${m.installed ? "done" : "primary"} sm" data-ng-one="${m.id}">${m.installed ? "설치됨" : "설치"}</button></div></div>`).join("");
  }
  const list = (PICKS[kind] || []);
  if (list.length) {
    html += `<div class="pin-head"><b>${PICK_TAG} ${PICK_KIND_LABEL[kind]} ${list.length}개</b><button class="link-btn" data-goto-rec>추천 탭에서 한 번에 설치</button></div>` +
      list.map((p) => pickRow(p, kind)).join("");
  }
  return html ? html + `<div class="pin-head"><b>전체 ${PICK_KIND_LABEL[kind]}</b></div>` : "";
}
function bindPinned(root) {
  bindPickRows(root);
  $$("[data-goto-rec]", root).forEach((b) => (b.onclick = () => document.querySelector('#modTabs [data-tab="neogul"]').click()));
  $$("[data-ng-one]", root).forEach((b) =>
    (b.onclick = async () => {
      if (b.textContent === "설치됨") return;
      b.disabled = true;
      b.textContent = "받는 중…";
      const r = await api.neogulMods.install(b.dataset.ngOne);
      b.disabled = false;
      if (r.ok) { b.className = "btn done sm"; b.textContent = "설치됨"; toast("설치했어요. 다음 PLAY 부터 적용돼요.", "ok"); }
      else { b.textContent = "설치"; toast(r.error || "설치하지 못했어요.", "err"); }
      updateInstalledCount();
    })
  );
}
loadPicks();

// 아이콘을 못 불러오면(인터넷 끊김 등) 깨진 그림 대신 기본 모양으로
const ICON_FALLBACK = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a8f99" stroke-width="1.6" stroke-linejoin="round"><rect width="24" height="24" fill="#2c2f37"/><path d="M12 5.5l5.5 3.1v6.3L12 18l-5.5-3.1V8.6z"/></svg>');
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img?.tagName === "IMG" && (img.classList.contains("ri-icon") || img.classList.contains("ng-logo")) && img.src !== ICON_FALLBACK) img.src = ICON_FALLBACK;
}, true);

api.onToast?.(({ msg, kind }) => toast(msg, kind));
api.update.onInstalling?.(({ version }) => toast(`새 버전${version ? " " + version : ""} 설치를 위해 잠깐 껐다 켤게요…`, "ok"));

// 홈 PLAY 옆 메모리 빠른 설정 (설정 > 게임 슬라이더와 같은 값)
async function fillMemQuick(s) {
  const sys = await api.systemMemory();
  const max = Math.max(4, Math.min(32, sys - 2));
  const sel = $("#memQuick");
  const cur = Math.min(s.memoryGB, max);
  sel.innerHTML = Array.from({ length: max - 1 }, (_, i) => i + 2)
    .map((g) => `<option value="${g}" ${g === cur ? "selected" : ""}>${g}GB${g === 4 ? " (추천)" : ""}</option>`).join("");
}
$("#memQuick").addEventListener("change", async (e) => {
  const v = Number(e.target.value);
  await api.settings.set({ memoryGB: v });
  $("#setMemory").value = String(v);
  $("#setMemoryVal").textContent = `${v}GB`;
  toast(`메모리를 ${v}GB 로 바꿨어요. 다음 PLAY 부터 적용돼요.`, "ok");
});
$("#setMemory").addEventListener("change", (e) => { $("#memQuick").value = e.target.value; });


// ─── 홈: 추천하고 보상 받기 ──────────────────────────────────────────────────
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000);
const kstDay = () => kstNow().toISOString().slice(0, 10);
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
// 추천했는지는 게임 채팅의 서버 안내("…님이 오늘 N번째로 서버를 추천해주셨습니다")로 런처가 알아냄
let recAt = 0;
const kstDayOf = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
api.rec.get().then((r) => { recAt = r?.at || 0; if (INFO) renderRecommend(); }).catch(() => {});
api.rec.onDone((r) => {
  recAt = r?.at || Date.now();
  if (INFO) renderRecommend();
  toast("오늘 서버 추천 완료!", "ok");
});
function renderRecommend() {
  const done = !!recAt && kstDayOf(recAt) === kstDay();
  const st = $("#recState");
  st.textContent = done ? "오늘 완료 ✓" : "오늘 아직 안 했어요";
  st.classList.toggle("done", done);
  const k = kstNow();
  const h = k.getUTCHours(), m = k.getUTCMinutes();
  let hot;
  if (h === 20) hot = "🔥 지금 핫타임 · 보상 2배";
  else if (h < 20) {
    const left = (20 - h) * 60 - m;
    hot = `핫타임(2배)까지 ${Math.floor(left / 60) ? Math.floor(left / 60) + "시간 " : ""}${left % 60}분`;
  } else hot = "자정에 초기화 · 내일 8시 핫타임";
  $("#recHot").textContent = hot;
  $("#recHot").classList.toggle("now", h === 20);
}
$("#recBtn").addEventListener("click", () => {
  api.openExternal(INFO.links.minelist);
  toast("마인리스트가 열렸어요. 추천하고 게임에 들어가면 보상이 오고 여기도 완료로 바뀌어요.", "ok");
});
setInterval(() => INFO && renderRecommend(), 60_000);

// ─── 기능 페이지 ─────────────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) return showPage(go.dataset.goto);
  const cg = e.target.closest("[data-calc-go]");
  if (cg && window.NugulTools) window.NugulTools.openCalc(cg.dataset.calcGo);
});
$("#toolRpFix").addEventListener("click", async () => {
  if (!confirm("서버 리소스팩을 지우고 다음 접속 때 새로 받게 할까요?\n(글자나 아이템이 깨질 때 쓰는 방법이에요)")) return;
  const r = await api.tools.clearRpCache();
  if (!r.ok) return toast(r.error, "err");
  toast(r.empty ? "지울 게 없어요. 접속하면 새로 받아져요." : "지웠어요. 다음에 접속하면 리소스팩을 새로 받아요.", "ok");
});
$("#toolShots").addEventListener("click", async () => {
  $("#shotsModal").hidden = false;
  const grid = $("#shotsGrid");
  grid.innerHTML = '<div class="spinner"></div>';
  const list = await api.tools.screenshots();
  if (!list.length) {
    grid.innerHTML = '<div class="empty">아직 스크린샷이 없어요.<br/><span class="small">게임 안에서 F2 를 누르면 찍혀요.</span></div>';
    return;
  }
  grid.innerHTML = list.map((x) => {
    const d = new Date(x.at);
    return `<button class="shot" data-shot="${esc(x.name)}" title="${esc(x.name)}">${x.thumb ? `<img src="${x.thumb}" alt="" />` : ""}<span>${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</span></button>`;
  }).join("");
  $$("[data-shot]", grid).forEach((b) => (b.onclick = () => api.tools.openScreenshot(b.dataset.shot)));
});
