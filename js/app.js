// こんだて逆算ノート

const $ = (s, el = document) => el.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
const storeById = (id) => STORES.find((s) => s.id === id);

// 保存はログイン中のユーザーごとに分ける（KD_PREFIX は auth.js で決まる）
const LS = {
  get(k, d) {
    try { const v = localStorage.getItem(KD_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(KD_PREFIX + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ }
  },
};

// ---------- アカウントの設定（場所・移動手段など） ----------
const SETTINGS = Object.assign({ area: AREAS[0].id, transport: 'walk', shareScope: 'dorm', offersOn: true, liveArea: null }, LS.get('kd-settings', {}));
// お店のアカウントは、登録した店舗のエリアに固定する
if (IS_STORE && MY_STORE) { SETTINGS.area = MY_STORE.area; SETTINGS.liveArea = null; SETTINGS.transport = 'walk'; }
// 見られる画面：お店のアカウントは「お店」と「アカウント」だけ。一般・ゲストには「お店」を見せない
const ALLOWED_TABS = IS_STORE ? (MY_STORE ? ['store', 'account'] : ['account']) : ['shop', 'history', 'prices', 'account'];
// お店からの配信は、端末の中の全アカウントで共有する（エリアごと）
const SHARED_OFFERS = {
  get: (area) => (AUTH.get('kd-shared-offers', {})[area] || []).map((o, i) => (o.id ? o : Object.assign(o, { id: `o${i}${o.store}${o.ing}` }))),
  set(area, list) { const all = AUTH.get('kd-shared-offers', {}); all[area] = list; AUTH.set('kd-shared-offers', all); },
};
// 配信の期限・状態
const OFFER_UNTIL = { today: '今日いっぱい', tomorrow: '明日の21時まで', two: 'あさっての21時まで' };
function untilDate(k) {
  const d = new Date();
  if (k === 'today') d.setHours(23, 59, 0, 0); else { d.setDate(d.getDate() + (k === 'two' ? 2 : 1)); d.setHours(21, 0, 0, 0); }
  return d.toISOString();
}
function fmtUntil(iso) {
  const d = new Date(iso), n = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
  return `${['今日', '明日', 'あさって'][days] || `${d.getMonth() + 1}/${d.getDate()}`}の${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}まで`;
}
const offerLive = (o) => o.status !== 'ended' && (!o.until || Date.now() < new Date(o.until).getTime());
const offerTaken = (o, h) => (o.reservations || []).filter((r) => h === undefined || r.h === h).length;
const myReservation = (o) => (o.reservations || []).find((r) => r.uid === AUTH.user.id);
// 受け取りコード：取り置きした人だけに出る4桁の番号。受け取る日だけ使える
const dayStr = (d) => { const x = d ? new Date(d) : new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function pickupDay(h) { const d = new Date(); if (d.getHours() >= h + 1) d.setDate(d.getDate() + 1); return dayStr(d); }
function fmtDay(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  const diff = Math.round((new Date(y, m - 1, d) - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 864e5);
  return `${m}/${d}${diff === 0 ? '（今日）' : diff === 1 ? '（明日）' : ''}`;
}
function newPickupCode(o) {
  const used = new Set((o.reservations || []).map((r) => r.code));
  for (let i = 0; i < 50; i++) {
    const r = new Uint16Array(1);
    try { crypto.getRandomValues(r); } catch (e) { r[0] = Math.floor(Math.random() * 65535); }
    const c = String(1000 + (r[0] % 9000));
    if (!used.has(c)) return c;
  }
  return String(1000 + Math.floor(Math.random() * 9000));
}
// 共有の配信データを読みなおしてから書きかえる（ほかの人の取り置きを消さないように）
function mutateOffers(fn) {
  const list = SHARED_OFFERS.get(SETTINGS.area);
  const r = fn(list);
  SHARED_OFFERS.set(SETTINGS.area, list);
  state.offers = list;
  return r;
}
const allAreas = (extra) => {
  const live = extra || SETTINGS.liveArea;
  return live ? [live, ...AREAS] : AREAS;
};
const currentArea = () => allAreas().find((a) => a.id === SETTINGS.area) || AREAS[0];
function applyArea() {
  const area = currentArea();
  const f = (TRANSPORTS[SETTINGS.transport] || TRANSPORTS.walk).factor;
  area.stores.forEach((st, i) => { Object.assign(STORES[i], { name: st.name, type: st.type, minutes: Math.max(1, Math.round(st.walk * f)) }); });
  for (const k of Object.keys(BETWEEN)) BETWEEN[k] = Math.max(1, Math.round(area.between[k] * f));
}
applyArea();
const moveLabel = (s) => `家から${(TRANSPORTS[SETTINGS.transport] || TRANSPORTS.walk).label}で${s.minutes}分`;
// わけあいの相手：登録した寮・大学（キャンパス）の名前で表示する
const shareGroup = () => {
  if (SETTINGS.shareScope === 'dorm') return (SETTINGS.shareDorm || '').trim();
  if (SETTINGS.shareScope === 'univ') return (SETTINGS.shareCampus || '').trim();
  return '';
};
const shareLabel = () => shareGroup() || SHARE_SCOPES[SETTINGS.shareScope] || SHARE_SCOPES.dorm;

function defaultPrices() {
  const scale = currentArea().priceScale;
  const p = {};
  const area = currentArea();
  for (const [id, ing] of Object.entries(INGREDIENTS)) {
    p[id] = {};
    for (const [sid, v] of Object.entries(ing.prices)) {
      // 業務用でない店・ドラッグストアでない店は、近所のスーパーと同じ品ぞろえ・価格の水準にする
      const src = (sid === 'B' && area.bSuper) || (sid === 'C' && area.cSuper) ? ing.prices.A : v;
      p[id][sid] = src === null || src === undefined ? null : Math.round(src * (scale[sid] || 1));
    }
  }
  return p;
}

// 自分で追加した献立・食材を読み込む
const customIngs = LS.get('kd-ings', {});
const customRecipes = LS.get('kd-recipes', []);
Object.assign(INGREDIENTS, customIngs);
customRecipes.forEach((r) => RECIPES.push(r));

const emptyForm = () => ({ open: false, name: '', tag: '主菜', rows: [{ id: '', qty: '' }], pending: {}, status: '', busy: false });

const state = {
  tab: ALLOWED_TABS[0],
  counts: LS.get('kd-counts', {}),
  prices: Object.assign(defaultPrices(), LS.get('kd-prices', {})),
  wage: LS.get('kd-wage', 800),
  offers: SHARED_OFFERS.get(SETTINGS.area),
  viewStore: MY_STORE ? MY_STORE.slot : 'A',
  ai: Object.assign({ key: '', model: 'claude-haiku-4-5' }, LS.get('kd-ai', {})),
  shares: LS.get('kd-shares', {}),
  priceDates: LS.get('kd-price-dates', {}),
  receipt: { store: 'B', text: '', result: null },
  tagFilter: 'all',
  step: 1,
  ptabInfo: { list: '', rest: 0 },
  planTotal: null,
  pantry: LS.get('kd-pantry', {}),
  pantryDates: LS.get('kd-pantry-dates', {}),
  bought: LS.get('kd-bought', {}),
  extras: LS.get('kd-extras', []),
  history: LS.get('kd-history', []),
  favs: LS.get('kd-favs', {}),
  menuLog: LS.get('kd-menu-log', null),
  editing: null,
  justRecorded: null,
  confirmDel: null,
  form: emptyForm(),
  acc: { area: SETTINGS.area, transport: SETTINGS.transport, locMsg: '' },
  confirmAcc: null,
};
// 献立の履歴（これまでに記録した献立）。以前の記録があれば、そこから作る
if (!Array.isArray(state.menuLog)) {
  state.menuLog = state.history.slice().reverse().map((h) => {
    const counts = {};
    (h.dishes || []).forEach((d) => {
      const m = String(d).match(/^(.*?)(?:×(\d+))?$/);
      const r = RECIPES.find((x) => x.name === m[1]);
      if (r) counts[r.id] = (counts[r.id] || 0) + Number(m[2] || 1);
    });
    return { at: h.at, counts };
  }).filter((x) => Object.keys(x.counts).length).reverse();
}
// 削除済みの献立が残っていたら外す
for (const id of Object.keys(state.counts)) if (!RECIPES.find((r) => r.id === id)) delete state.counts[id];

function save() {
  LS.set('kd-counts', state.counts);
  LS.set('kd-prices', state.prices);
  LS.set('kd-wage', state.wage);
  LS.set('kd-ings', customIngs);
  LS.set('kd-recipes', customRecipes);
  LS.set('kd-ai', state.ai);
  LS.set('kd-shares', state.shares);
  LS.set('kd-price-dates', state.priceDates);
  LS.set('kd-bought', state.bought);
  LS.set('kd-extras', state.extras);
  LS.set('kd-history', state.history);
  LS.set('kd-favs', state.favs);
  LS.set('kd-menu-log', state.menuLog);
  LS.set('kd-pantry', state.pantry);
  LS.set('kd-pantry-dates', state.pantryDates);
  LS.set('kd-settings', SETTINGS);
}

// ---------- 表示用の小さな関数 ----------

const FRACTIONS = [[0.25, '1/4'], [0.5, '1/2'], [0.75, '3/4'], [1 / 3, '1/3'], [2 / 3, '2/3']];
function fmtQty(ingId, q) {
  const ing = INGREDIENTS[ingId];
  if (ing.unit === 'g' || ing.unit === 'ml') return `${Math.round(q)}${ing.unit}`;
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  if (frac < 0.03) return `${whole}${ing.unit}`;
  const hit = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.04);
  const fracText = hit ? hit[1] : frac.toFixed(1).replace(/^0/, '');
  return whole ? `${whole}と${fracText}${ing.unit}` : `${fracText}${ing.unit}`;
}

function fmtFrac(f) {
  const hit = FRACTIONS.find(([v]) => Math.abs(v - f) < 0.04);
  return hit ? hit[1] : `${Math.round(f * 100)}%`;
}

function travelMinutes(storeIds) {
  if (storeIds.length === 1) return storeById(storeIds[0]).minutes * 2;
  const [x, y] = storeIds;
  const key = [x, y].sort().join('');
  return storeById(x).minutes + BETWEEN[key] + storeById(y).minutes;
}

// ---------- 価格（お店からの値引き配信を反映） ----------

function offerFor(storeId, ingId) {
  return state.offers.find((o) => o.store === storeId && o.ing === ingId && offerLive(o));
}
function basePrice(ingId, storeId) {
  const v = state.prices[ingId] ? state.prices[ingId][storeId] : null;
  return v === null || v === undefined || v === '' || isNaN(v) ? null : Number(v);
}
function priceOf(ingId, storeId) {
  const base = basePrice(ingId, storeId);
  if (base === null) return null;
  const offer = SETTINGS.offersOn ? offerFor(storeId, ingId) : null;
  return offer ? Math.round(base * (1 - offer.discount)) : base;
}
function cheapestPrice(ingId) {
  const list = STORES.map((s) => priceOf(ingId, s.id)).filter((v) => v !== null);
  return list.length ? Math.min(...list) : null;
}

// ---------- 計算 ----------

function computeItems(counts = state.counts) {
  const need = {};
  for (const [rid, c] of Object.entries(counts)) {
    if (!c) continue;
    const r = RECIPES.find((x) => x.id === rid);
    if (!r) continue;
    for (const [ing, q] of Object.entries(r.uses)) need[ing] = (need[ing] || 0) + q * c;
  }
  return Object.entries(need).filter(([id]) => INGREDIENTS[id]).map(([id, q]) => {
    const ing = INGREDIENTS[id];
    // 家にある食材を先に使い、足りない分だけ買う
    const have = Math.max(0, Number(state.pantry[id]) || 0);
    const fromPantry = Math.min(have, q);
    const buy = q - fromPantry;
    const packs = buy > ing.pack * 0.01 ? Math.ceil(buy / ing.pack - 1e-9) : 0;
    const it = { id, need: q, fromPantry, buy, pantryLeft: have - fromPantry, packs, leftover: packs ? packs * ing.pack - buy : 0, factor: 1 };
    // わけあい：使い切れない分（1/4パック以上）を、近くの人と分けて買う
    it.canShare = SETTINGS.shareScope !== 'off' && packs > 0 && ing.keep !== 'long' && it.leftover >= ing.pack * 0.25 - 1e-9;
    if (it.canShare && state.shares[id]) {
      const portion = Math.min(packs * ing.pack, (Math.ceil((buy / ing.pack) * 4 - 1e-9) / 4) * ing.pack);
      it.shared = true;
      it.factor = portion / (packs * ing.pack);
      it.giveAway = it.leftover - (portion - buy);
      it.leftover = portion - buy;
    }
    return it;
  });
}

function costAt(item, storeId) {
  const p = priceOf(item.id, storeId);
  return p === null ? null : Math.round(p * item.packs * (item.factor || 1));
}

function buildPlans(items) {
  const plans = [];
  // 1軒で全部そろえる
  for (const s of STORES) {
    let total = 0, ok = true;
    const assign = {};
    for (const it of items) {
      const c = costAt(it, s.id);
      if (c === null) { ok = false; break; }
      total += c; assign[it.id] = s.id;
    }
    if (ok) plans.push({ stores: [s.id], total, minutes: travelMinutes([s.id]), assign });
  }
  // 2軒に分けて買う
  for (let i = 0; i < STORES.length; i++) {
    for (let j = i + 1; j < STORES.length; j++) {
      const X = STORES[i].id, Y = STORES[j].id;
      let total = 0, ok = true;
      const assign = {}, used = new Set();
      for (const it of items) {
        const a = costAt(it, X), b = costAt(it, Y);
        if (a === null && b === null) { ok = false; break; }
        const pick = b === null || (a !== null && a <= b) ? X : Y;
        total += pick === X ? a : b;
        assign[it.id] = pick; used.add(pick);
      }
      if (ok && used.size === 2) {
        // 近い店から回る
        const order = [X, Y].sort((p, q) => storeById(p).minutes - storeById(q).minutes);
        plans.push({ stores: order, total, minutes: travelMinutes(order), assign });
      }
    }
  }
  const wage = Number(state.wage) || 0;
  plans.forEach((p) => { p.effective = p.total + (p.minutes * wage) / 60; });
  return plans;
}

// これまでの選び方：「安い品目がいちばん多い店」
function pickByCount(items, singles) {
  let best = null;
  for (const p of singles) {
    const sid = p.stores[0];
    let wins = 0;
    for (const it of items) {
      const mine = priceOf(it.id, sid);
      if (mine !== null && mine <= cheapestPrice(it.id)) wins++;
    }
    if (!best || wins > best.wins || (wins === best.wins && p.minutes < best.plan.minutes)) best = { plan: p, wins };
  }
  return best;
}

function leftoverInfo(items) {
  const risky = [], frozen = [], keeps = [];
  let lossValue = 0;
  for (const it of items) {
    const ing = INGREDIENTS[it.id];
    if (it.leftover < ing.pack * 0.05) continue;
    const entry = { ...it, ing };
    if (ing.keep === 'short') {
      risky.push(entry);
      lossValue += (it.leftover / ing.pack) * (cheapestPrice(it.id) || 0);
    } else if (ing.keep === 'freeze') frozen.push(entry);
    else keeps.push(entry);
  }
  return { risky, frozen, keeps, lossValue };
}

// 買い物と献立のあとに残るもの（買って余る分＋使わなかった家の食材）
function restList(all) {
  const out = all.map((it) => ({ ...it, leftover: it.leftover + it.pantryLeft }));
  for (const [id, q] of Object.entries(state.pantry)) {
    if (INGREDIENTS[id] && q > 0 && !all.find((it) => it.id === id)) out.push({ id, need: 0, packs: 0, leftover: q, pantryLeft: q, fromPantry: 0 });
  }
  return out;
}

function suggestions(items, anyKeep = false) {
  const left = {};
  items.forEach((it) => { left[it.id] = it.leftover; });
  const riskyIds = items.filter((it) => (anyKeep || INGREDIENTS[it.id].keep === 'short') && it.leftover >= INGREDIENTS[it.id].pack * 0.2).map((it) => it.id);
  if (!riskyIds.length) return [];
  return RECIPES.filter((r) => !state.counts[r.id])
    .map((r) => {
      let score = 0;
      const extra = [];
      const used = [];
      for (const [ing, q] of Object.entries(r.uses)) {
        if (riskyIds.includes(ing) && left[ing] > 0) {
          score += Math.min(1, left[ing] / q);
          used.push({ id: ing, q: Math.min(left[ing], q) });
        }
        if (!(left[ing] >= q - 1e-9)) extra.push(ing);
      }
      // 使い切れる分の金額（ムダにならずにすむ分）
      const saved = used.reduce((a, u) => a + (u.q / INGREDIENTS[u.id].pack) * (cheapestPrice(u.id) || 0), 0);
      return { r, score, extra, used, saved };
    })
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.extra.length - b.extra.length)
    .slice(0, 3);
}

// ---------- お店側：需要予測 ----------

function storeDemand(storeId) {
  const users = REGION_USERS * STORE_SHARE[storeId];
  const demand = {};
  RECIPES.forEach((r) => {
    const n = users * r.pop;
    for (const [ing, q] of Object.entries(r.uses)) demand[ing] = (demand[ing] || 0) + n * q;
  });
  return Object.entries(demand)
    .filter(([id]) => basePrice(id, storeId) !== null)
    .map(([id, q]) => {
      const ing = INGREDIENTS[id];
      const packs = Math.max(1, Math.round(q / ing.pack));
      const stock = Math.round(packs * (STOCK_FACTOR[id] || 1.05));
      const ratio = stock / packs;
      let status = 'ok';
      if (ratio < 0.95) status = 'short';
      else if (ratio > 1.2 && ing.keep === 'short') status = 'risk';
      else if (ratio > 1.2) status = 'extra';
      return { id, ing, demand: packs, stock, ratio, status, excess: Math.max(0, stock - packs) };
    })
    .sort((a, b) => b.demand - a.demand);
}

// ---------- 描画：かいもの ----------

const TAG_ORDER = ['主菜', '主食', '汁物', '副菜'];

// よく作る回数（献立の履歴から数える）
function madeCounts() {
  const n = {};
  (state.menuLog || []).forEach((m) => { for (const [id, c] of Object.entries(m.counts)) n[id] = (n[id] || 0) + c; });
  return n;
}

const STAR = (on) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" fill="${on ? '#f2b84b' : 'none'}" stroke="${on ? '#e0a332' : '#9aabb5'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

function recipeCard(r) {
  const c = state.counts[r.id] || 0;
  const uses = Object.entries(r.uses).map(([id, q]) => `${INGREDIENTS[id].name} ${fmtQty(id, q)}`).join('、');
  const fav = !!state.favs[r.id];
  const made = (state.madeCache || {})[r.id] || 0;
  return `
    <article class="recipe ${c ? 'is-on' : ''}" data-tag="${r.tag}">
      <button class="fav-btn ${fav ? 'is-on' : ''}" data-action="fav" data-id="${r.id}" aria-pressed="${fav}" aria-label="${esc(r.name)}をお気に入り${fav ? 'から外す' : 'に登録'}">${STAR(fav)}</button>
      <div class="recipe-main">
        <h4>${esc(r.name)}${r.custom ? `<span class="tag-mini" data-tag="${r.tag}">${r.tag}</span>` : ''}${made ? `<span class="made-badge">${made}回</span>` : ''}</h4>
        <p class="uses">${uses}</p>
        ${r.custom ? `<button class="link small" data-action="del-recipe" data-id="${r.id}">削除</button>` : ''}
      </div>
      <div class="stepper" aria-label="${esc(r.name)}の回数">
        <button data-action="dec" data-id="${r.id}" aria-label="へらす" ${c ? '' : 'disabled'}>−</button>
        <span class="count">${c}</span>
        <button data-action="inc" data-id="${r.id}" aria-label="ふやす">＋</button>
      </div>
    </article>`;
}

function renderTagbar() {
  const f = state.tagFilter;
  const picked = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const mine = RECIPES.filter((r) => r.custom).length;
  const favN = RECIPES.filter((r) => state.favs[r.id]).length;
  const madeN = Object.keys(state.madeCache || {}).filter((id) => RECIPES.find((r) => r.id === id)).length;
  const tabs = [
    ['all', 'すべて', RECIPES.length],
    ['picked', 'えらび中', picked],
    ['fav', '★ お気に入り', favN],
    ['often', 'よく作る', madeN],
    ...(mine ? [['mine', 'じぶんの献立', mine]] : []),
    ...TAG_ORDER.map((t) => [t, t, RECIPES.filter((r) => r.tag === t && !r.custom).length]),
  ];
  if (f === 'mine' && !mine) state.tagFilter = 'all';
  $('#tagbar').innerHTML = `<div class="tagbar" role="tablist" aria-label="献立の種類">
    ${tabs.map(([k, label, n]) => `<button role="tab" aria-selected="${state.tagFilter === k}" class="tb ${state.tagFilter === k ? 'is-on' : ''}" data-action="tag-filter" data-k="${k}" data-tag="${k}">${label}<span class="tb-n">${n}</span></button>`).join('')}
  </div>`;
}

function renderRecipes() {
  state.madeCache = madeCounts();
  renderTagbar();
  const f = state.tagFilter;
  const group = (title, tag, list) => list.length
    ? `<div class="recipe-group"><h3 class="tag-title" data-tag="${tag}">${title}</h3><div class="recipe-grid">${list.map(recipeCard).join('')}</div></div>`
    : '';
  let html = '';
  if (f === 'picked') {
    const list = RECIPES.filter((r) => state.counts[r.id]);
    html = list.length ? group('えらび中', 'picked', list) : '<p class="muted tb-empty">まだ献立をえらんでいません。「すべて」から「＋」で選べます。</p>';
  } else if (f === 'fav') {
    const list = RECIPES.filter((r) => state.favs[r.id]);
    html = list.length ? group('★ お気に入り', 'fav', list) : '<p class="muted tb-empty">お気に入りはまだありません。よく作る献立のカードの ☆ を押すと、ここにまとまります。</p>';
  } else if (f === 'often') {
    const m = state.madeCache;
    const list = RECIPES.filter((r) => m[r.id]).sort((a, b) => m[b.id] - m[a.id]);
    html = list.length ? group('よく作る献立（作った回数順）', 'often', list) : '<p class="muted tb-empty">まだ記録がありません。「買った！記録する」を押すと、作った献立がここに回数順で並びます。</p>';
  } else {
    const mine = RECIPES.filter((r) => r.custom);
    if (f === 'all') html += group('★ お気に入り', 'fav', RECIPES.filter((r) => state.favs[r.id]));
    if (f === 'all' || f === 'mine') html += group('じぶんの献立', 'mine', mine);
    if (f !== 'mine') html += TAG_ORDER.filter((t) => f === 'all' || f === t).map((t) => group(t, t, RECIPES.filter((r) => r.tag === t && !r.custom))).join('');
  }
  $('#recipes').innerHTML = html;
}

function renderOffers() {
  const box = $('#offers');
  const live = state.offers.filter(offerLive);
  if (!live.length || !SETTINGS.offersOn) { box.innerHTML = ''; return; }
  const first = live[0];
  box.innerHTML = `
    <details class="offer-card" id="offer-details" ${state.offerOpen ? 'open' : ''}>
      <summary class="offer-head">お店からのおすすめ ${live.length}件　<span class="offer-sum">${esc(INGREDIENTS[first.ing].name)} ${Math.round(first.discount * 100)}%オフ${live.length > 1 ? ' ほか' : ''}</span><span class="muted small">（タップで開く）</span></summary>
      ${live.map((o) => {
        const s = storeById(o.store), ing = INGREDIENTS[o.ing];
        const rs = (o.recipes || []).map((id) => RECIPES.find((r) => r.id === id));
        return `<div class="offer-row">
          <p><b>${s.name}</b>で <b>${ing.name}</b> が <span class="off">${Math.round(o.discount * 100)}%オフ</span>
          <span class="muted">${yen(basePrice(o.ing, o.store))} → ${yen(priceOf(o.ing, o.store))}</span></p>
          ${o.message ? `<p class="offer-msg small">「${esc(o.message)}」</p>` : ''}
          ${o.slots && o.slots.length ? offerSlotHtml(o) : ''}
          ${o.until ? `<p class="muted small">${fmtUntil(o.until)}</p>` : ''}
          <p class="offer-recipes">${rs.filter(Boolean).map((r) => `<button class="chip" data-action="inc" data-id="${r.id}">＋ ${esc(r.name)}</button>`).join('')}</p>
        </div>`;
      }).join('')}
      ${state.reserveMsg ? `<p class="small warn">${esc(state.reserveMsg)}</p>` : ''}
    </details>`;
}

// 取り置き：人によって配信する時間帯を分ける（混雑を避ける）。埋まっていたら空いている時間帯を案内
function offerSlotHtml(o) {
  const mine = myReservation(o);
  if (mine) {
    if (mine.picked) return `<p class="offer-slot small"><span class="tag-share">受け取り済み</span><span class="muted">ありがとうございました</span></p>`;
    const expired = mine.day && mine.day < dayStr();
    return `<div class="pickup ${expired ? 'is-expired' : ''}">
      <p class="small"><span class="tag-share">取り置き済み</span> ${fmtDay(mine.day || dayStr())} ${mine.h}時台に受け取り</p>
      ${mine.code ? `<p class="pickup-code" aria-label="受け取りコード">${mine.code.split('').map((c) => `<span>${c}</span>`).join('')}</p>
      <p class="muted small">${expired ? 'このコードの期限は過ぎました。' : `レジでこの番号を伝えてください。${fmtDay(mine.day || dayStr())}だけ使えます。ほかの人には見えません。`}</p>` : ''}
      <button class="link small" data-action="reserve" data-id="${o.id}">取り置きを取り消す</button>
    </div>`;
  }
  const seed = [...(AUTH.user.id + o.ing)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const mySlot = o.slots[seed % o.slots.length];
  const left = (sl) => sl.limit - offerTaken(o, sl.h);
  const btn = (sl) => `<button class="chip" data-action="reserve" data-id="${o.id}" data-h="${sl.h}">取り置きする</button>`;
  if (left(mySlot) > 0) return `<p class="offer-slot small">あなたへの配信枠：<b>${mySlot.h}時台</b>・残り${left(mySlot)}個　${btn(mySlot)}</p>`;
  const other = o.slots.find((sl) => left(sl) > 0);
  if (other) return `<p class="offer-slot small">${mySlot.h}時台は受付終了。<b>${other.h}時台</b>なら残り${left(other)}個　${btn(other)}</p>`;
  return '<p class="offer-slot small muted">取り置きは受付終了しました（店頭では値引き価格で買えます）</p>';
}

function planLabel(p) {
  return p.stores.map((id) => storeById(id).name).join(' → ');
}

// 最近の献立（記録した献立を、そのままもう一度えらべる）
function recentMenusHtml() {
  const seen = new Set();
  const list = (state.menuLog || []).filter((m) => {
    const key = Object.keys(m.counts).sort().join(',');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Object.keys(m.counts).every((id) => RECIPES.find((r) => r.id === id));
  }).slice(0, 3);
  if (!list.length) return '';
  return `<div class="recent">
    <p class="recent-title">最近の献立 <span class="muted small">そのままもう一度えらべます</span></p>
    <div class="recent-list">${list.map((m) => {
      const d = new Date(m.at);
      const i = state.menuLog.indexOf(m);
      const names = Object.entries(m.counts).map(([id, c]) => esc(RECIPES.find((r) => r.id === id).name) + (c > 1 ? '×' + c : ''));
      const n = Object.values(m.counts).reduce((a, b) => a + b, 0);
      return `<button class="recent-card" data-action="reuse-menu" data-i="${i}">
        <span class="rc-date">${d.getMonth() + 1}/${d.getDate()}<small>${n}食分</small></span>
        <span class="rc-names">${names.join('、')}</span>
        <span class="rc-go">もう一度えらぶ</span>
      </button>`;
    }).join('')}</div>
  </div>`;
}

function renderPicked() {
  const box = $('#picked');
  const chosen = RECIPES.filter((r) => state.counts[r.id]);
  if (!chosen.length) {
    const fromHome = Object.keys(state.pantry).length ? suggestions(restList([]), true) : [];
    box.innerHTML = `${recentMenusHtml()}<div class="start-card">
      <p>作りたい献立を「＋」でえらぶと、いちばん安い買い方を出します。</p>
      ${fromHome.length ? `<p class="lo-title">家にある食材を使える献立</p>
        <p class="start-chips">${fromHome.map((x) => `<button class="chip" data-action="inc" data-id="${x.r.id}">＋ ${esc(x.r.name)}<span class="muted small">${x.extra.length ? '' : '・買い足しなし'}</span></button>`).join('')}</p>` : ''}
      <button class="link small" data-action="sample">サンプルの献立を入れてみる</button>
    </div>`;
    return;
  }
  const order = (r) => TAG_ORDER.indexOf(r.tag);
  chosen.sort((a, b) => order(a) - order(b));
  const total = chosen.reduce((a, r) => a + state.counts[r.id], 0);
  const byTag = TAG_ORDER.map((t) => [t, chosen.filter((r) => r.tag === t).reduce((a, r) => a + state.counts[r.id], 0)]).filter(([, n]) => n);
  box.innerHTML = `<div class="picked">
    <div class="picked-head">
      <p class="picked-title">えらんだ献立 <span class="num">${total}</span><small>食分</small></p>
      <p class="picked-tags">${byTag.map(([t, n]) => `<span class="tag-mini" data-tag="${t}">${t} ${n}</span>`).join('')}</p>
      <button class="link small" data-action="clear">ぜんぶはずす</button>
    </div>
    <div class="picked-chips">
      ${chosen.map((r) => `<span class="pc" data-tag="${r.tag}">
        <span class="p-dot" data-tag="${r.tag}"></span>${esc(r.name)}
        <button data-action="dec" data-id="${r.id}" aria-label="${esc(r.name)}をへらす">−</button><b class="num">${state.counts[r.id]}</b><button data-action="inc" data-id="${r.id}" aria-label="${esc(r.name)}をふやす">＋</button>
      </span>`).join('')}
    </div>
  </div>`;
}

function renderPlan() {
  state.ptabInfo = { list: '', rest: 0 };
  state.planTotal = null;
  renderPlanInner();
  renderSteps();
  renderMbar();
}

const STEP_NAMES = ['', '献立をえらぶ', '買い方を見る', '買い物する', '家の食材'];

function renderSteps() {
  const i = state.ptabInfo;
  const n = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const home = Object.keys(state.pantry).length;
  if ((state.step === 2 || state.step === 3) && !n) state.step = 1;
  const sub = ['', n ? `${n}食分` : '', state.planTotal !== null && n ? yen(state.planTotal) : '', n && i.list ? i.list : '', home ? `${home}品` : ''];
  const locked = (k) => (k === 2 || k === 3) && !n;
  $('#steps').innerHTML = [1, 2, 3, 4].map((k) => `<button class="st ${state.step === k ? 'is-on' : ''} ${state.step > k ? 'is-past' : ''}" data-action="step" data-k="${k}" ${locked(k) ? 'disabled' : ''} aria-current="${state.step === k ? 'step' : 'false'}">
      <span class="st-no">${k}</span><span class="st-text"><span class="st-label">${STEP_NAMES[k]}</span><span class="st-sub">${sub[k] || '&nbsp;'}</span></span>
    </button>`).join('');
  document.querySelectorAll('.step-panel').forEach((el) => { el.hidden = Number(el.dataset.s) !== state.step; });
}

function goStep(k) {
  state.step = k;
  renderSteps();
  renderMbar();
  window.scrollTo({ top: 0 });
}

// 画面の下に固定する「もどる／次へ」
function renderMbar() {
  const bar = $('#mbar');
  if (state.tab !== 'shop') { bar.hidden = true; return; }
  const n = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const k = state.step;
  const backTo = k === 4 && !n ? 1 : k - 1;
  const back = k > 1 && !(k === 4 && !n) ? `<button class="mb-back" data-action="step" data-k="${backTo}">← もどる</button>` : '<span></span>';
  let info = '', next = '';
  if (k === 1) {
    info = n ? `<span class="mb-info"><b class="num">${n}</b>食分えらび中</span>` : '<span class="mb-info">献立を「＋」でえらんでください</span>';
    next = `<button class="mb-next" data-action="step" data-k="2" ${n ? '' : 'disabled'}>買い方を見る →</button>`;
  } else if (k === 2) {
    info = state.planTotal !== null ? `<span class="mb-info">合計 <b class="num">${yen(state.planTotal)}</b></span>` : '<span></span>';
    next = state.lastPlan && state.lastPlan.items.length
      ? '<button class="mb-next" data-action="step" data-k="3">買い物リストへ →</button>'
      : '<button class="mb-next" data-action="record">作る！（記録）</button>';
  } else if (k === 3) {
    const lp = state.lastPlan;
    const done = lp ? lp.items.filter((it) => state.bought[it.id]).length : 0;
    info = lp ? `<span class="mb-info">買った <b class="num">${done}</b> / ${lp.items.length}品</span>` : '<span></span>';
    next = `<button class="mb-next" data-action="record" ${done + state.extras.length ? '' : 'disabled'}>買った！記録する</button>`;
  } else {
    info = `<span class="mb-info">家にある食材 <b class="num">${Object.keys(state.pantry).length}</b>品</span>`;
    next = '<button class="mb-next" data-action="step" data-k="1">次の献立をえらぶ →</button>';
  }
  bar.innerHTML = back + info + next;
  bar.hidden = false;
}

function renderPlanInner() {
  const all = computeItems();
  const items = all.filter((it) => it.packs > 0);
  const box = $('#plan');
  const listBox = $('#list');
  $('#sugg-box').innerHTML = '';
  $('#recorded').innerHTML = state.justRecorded ? recordedBanner() : '';
  renderPantry();

  if (!all.length) {
    listBox.innerHTML = '<div class="empty"><p>献立をえらぶと、お店ごとの買い物リストがここに出ます。</p></div>';
    const fromHome = suggestions(restList([]), true);
    box.innerHTML = `<div class="empty">
      <p>左から作りたい献立をえらぶと、<br>いちばん安い買い方がここに出ます。</p>
      <button class="btn-soft" data-action="sample">サンプルの献立を入れてみる</button>
    </div>
    ${fromHome.length ? `<div class="sugg home-sugg">
      <p class="lo-title">家にある食材を使える献立</p>
      <ul>${fromHome.map((x) => `<li>
        <div><b>${esc(x.r.name)}</b><span class="muted small">${x.extra.length ? '買い足し：' + x.extra.map((id) => INGREDIENTS[id].name).join('・') : '買い足しなしで作れる'}</span></div>
        <button class="btn-soft" data-action="inc" data-id="${x.r.id}">えらぶ</button>
      </li>`).join('')}</ul>
    </div>` : ''}`;
    $('#leftover').innerHTML = '<div class="empty"><p>献立をえらぶと、余りそうな食材と、使い切れる献立がここに出ます。</p></div>';
    state.lastPlan = null;
    return;
  }
  const homeUse = all.filter((it) => it.fromPantry > 0);
  const homeBlock = homeUse.length ? `<div class="home-use">
      <p class="lo-title">家にある食材を使います</p>
      <p>${homeUse.map((it) => `<span class="lo-chip lo-home">${esc(INGREDIENTS[it.id].name)} ${fmtQty(it.id, it.fromPantry)}${it.packs ? '' : '<b>　買わなくてOK</b>'}</span>`).join('')}</p>
    </div>` : '';
  if (!items.length) {
    box.innerHTML = `${homeBlock}<div class="done"><p>今回の献立は、家にある食材だけで作れます。</p></div>`;
    state.planTotal = 0;
    listBox.innerHTML = `<div class="done"><p>買い物はありません。作ったら下のボタンで記録してください。</p></div>
      <div class="buybar"><div><span class="small muted">買い物</span><span class="num"><b>なし</b></span></div>
      <div class="bb-actions"><button class="btn" data-action="record">作る！（家の食材を使ったことを記録）</button></div></div>`;
    state.lastPlan = { all, items: [], plan: null };
    renderLeftover(items, all);
    return;
  }

  const plans = buildPlans(items);
  if (!plans.length) {
    box.innerHTML = `<div class="empty"><p>どの組み合わせでも買えない食材があります。価格メモを確認してください。</p></div>`;
    listBox.innerHTML = '';
    $('#leftover').innerHTML = '';
    return;
  }
  const singles = plans.filter((p) => p.stores.length === 1);
  const cheapest = [...plans].sort((a, b) => a.total - b.total)[0];
  const recommended = [...plans].sort((a, b) => a.effective - b.effective)[0];
  const bestSingle = singles.length ? [...singles].sort((a, b) => a.total - b.total)[0] : null;
  const byCount = singles.length ? pickByCount(items, singles) : null;

  // 時給換算（いちばん安い1軒と比べて）
  const hourly = (p) => {
    if (!bestSingle || p.stores.length === 1) return null;
    const saved = bestSingle.total - p.total;
    const extra = p.minutes - bestSingle.minutes;
    if (saved <= 0) return { text: '1軒で買うより高くなる', bad: true };
    if (extra <= 0) return { text: `時間もかからず ${yen(saved)} おトク`, good: true, saved };
    const h = (saved / extra) * 60;
    return { text: `${extra}分よけいにかかって ${yen(saved)} おトク（1時間あたり ${yen(h)}）`, value: h, saved, extra, good: h >= state.wage };
  };

  const recH = hourly(recommended);
  const countGap = byCount && bestSingle && byCount.plan !== bestSingle ? byCount.plan.total - bestSingle.total : 0;
  const compare = byCount && byCount.plan !== bestSingle && bestSingle
    ? `<div class="compare">
        <p class="compare-title">1軒で買うとき、「安い品目の数」で選ぶと…（お金だけで比較）</p>
        <div class="compare-row">
          <div><span class="muted">品目数でえらぶ</span><b>${storeById(byCount.plan.stores[0]).name}</b><span class="num">${yen(byCount.plan.total)}</span><span class="muted small">安い品目 ${byCount.wins}個</span></div>
          <div class="arrow">→</div>
          <div><span class="muted">合計でえらぶ</span><b>${storeById(bestSingle.stores[0]).name}</b><span class="num">${yen(bestSingle.total)}</span><span class="muted small">差額 ${yen(byCount.plan.total - bestSingle.total)} おトク</span></div>
        </div>
      </div>`
    : byCount && bestSingle
      ? `<p class="note">「安い品目の数」で選んでも、合計で選んでも <b>${storeById(bestSingle.stores[0]).name}</b> で同じ結果です。</p>`
      : '';

  const options = [...plans].sort((a, b) => a.total - b.total).map((p) => {
    const h = hourly(p);
    return `<li class="${p === recommended ? 'is-rec' : ''}">
      <span class="opt-name">${planLabel(p)}</span>
      <span class="opt-total num">${yen(p.total)}</span>
      <span class="opt-time">${p.minutes}分</span>
      <span class="opt-h ${h ? (h.good ? 'good' : h.bad ? 'bad' : '') : ''}">${h ? h.text : p === bestSingle ? '1軒で最安' : ''}</span>
    </li>`;
  }).join('');

  // 買い物リスト（おすすめプラン）
  const lists = recommended.stores.map((sid) => {
    const s = storeById(sid);
    const rows = items.filter((it) => recommended.assign[it.id] === sid).map((it) => listRow(it, sid)).join('');
    const sub = items.filter((it) => recommended.assign[it.id] === sid).reduce((a, it) => a + costAt(it, sid), 0);
    return `<div class="shop-list" style="--store:${s.color}">
      <p class="shop-name"><span class="dot"></span>${s.name}<span class="muted small">${s.type}・${moveLabel(s)}</span></p>
      <ul>${rows}</ul>
      <p class="subtotal">小計（予定） <span class="num">${yen(sub)}</span></p>
    </div>`;
  }).join('') + extrasBlock() + buyBar(items, recommended);
  state.lastPlan = { all, items, plan: recommended };

  state.planTotal = recommended.total;
  const doneN = items.filter((it) => state.bought[it.id]).length;
  state.ptabInfo.list = `${doneN}/${items.length}`;
  const dishLine = `<p class="dish-line"><span class="muted small">えらんだ献立</span> ${RECIPES.filter((r) => state.counts[r.id]).map((r) => esc(r.name) + (state.counts[r.id] > 1 ? '×' + state.counts[r.id] : '')).join('、')} <button class="link small" data-action="step" data-k="1">変える</button></p>`;
  box.innerHTML = `${dishLine}
    <div class="rec-card">
      <p class="rec-label">おすすめの買い方</p>
      <p class="rec-stores">${planLabel(recommended)}</p>
      <div class="rec-figs">
        <div><span class="muted small">合計</span><span class="big num">${yen(recommended.total)}</span></div>
        <div><span class="muted small">移動</span><span class="mid num">${recommended.minutes}<small>分</small></span></div>
        ${recH && recH.saved ? `<div><span class="muted small">2軒目に寄ると</span><span class="mid num">${yen(recH.saved)}<small>おトク</small></span></div>` : ''}
      </div>
      ${recH && recH.extra ? `<p class="note">2軒目に寄ると移動が${recH.extra}分ふえますが、1軒で買うより ${yen(recH.saved)} 安くなります。</p>` : ''}
      ${recommended !== cheapest ? `<p class="note">いちばん安いのは「${planLabel(cheapest)}」の ${yen(cheapest.total)} ですが、${cheapest.minutes - recommended.minutes}分よけいにかかるわりに ${yen(recommended.total - cheapest.total)} しか変わらないので、こちらをおすすめします。</p>` : ''}
      ${!bestSingle ? '<p class="note">今回の食材は1軒ではそろわないので、2軒に分けて買うプランです。</p>' : ''}
      ${countGap > 0 && recommended !== byCount.plan ? `<p class="note good-note">「安い品目が多いお店」で選ぶより、合計金額で選ぶと ${yen(countGap)} おトクです。</p>` : ''}
    </div>
    <details class="options" ${state.optOpen ? 'open' : ''} id="opt-details">
      <summary>くわしく比べる（ほかの買い方・寄り道の基準）</summary>
      ${compare}
      <p class="opt-head">ほかの買い方</p>
      <ul class="opt-list">${options}</ul>
      <div class="wage-box">
        <label class="wage" for="wage">寄り道するのは、1時間あたり
          <input type="number" id="wage" min="0" step="50" value="${state.wage}"> 円以上おトクになるとき
        </label>
        <p class="muted small">寄り道すると時間はかかりますが、安く買えます。その「浮いたお金」を1時間あたりに直した金額が、ここで決めた金額より大きいときだけ、2軒回るプランをおすすめします。<br>例：12分よけいにかかって ¥200 安くなる → 1時間あたり ¥1,000</p>
      </div>
    </details>
    ${homeBlock}
  `;
  listBox.innerHTML = `
    <p class="muted small list-hint">${planLabel(recommended)}・買ったら ✓。違うものを買ったら「変更」</p>
    <div class="lists">${lists}</div>`;

  renderLeftover(items, all);
}

// ---------- 家にある食材 ----------

function renderPantry() {
  const box = $('#pantry');
  const ids = Object.keys(state.pantry).filter((id) => INGREDIENTS[id]);
  const now = Date.now();
  const opts = Object.entries(INGREDIENTS).map(([id, ing]) => `<option value="${id}">${esc(ing.name)}（${ing.unit}）</option>`).join('');
  box.innerHTML = `<div class="pantry">
    <div class="pantry-head"><p class="lo-title">家にある食材</p><span class="muted small">献立で先に使い、足りない分だけ買います</span></div>
    ${ids.length ? `<p class="pantry-chips">${ids.map((id) => {
      const ing = INGREDIENTS[id];
      const days = state.pantryDates[id] ? Math.floor((now - new Date(state.pantryDates[id]).getTime()) / 86400000) : null;
      const old = ing.keep === 'short' && days !== null && days >= 3;
      return `<span class="lo-chip lo-${ing.keep} ${old ? 'is-old' : ''}">${esc(ing.name)} ${fmtQty(id, state.pantry[id])}${days !== null ? `<small>${days ? days + '日前' : '今日'}${old ? '・早めに' : ''}</small>` : ''}<button class="x" data-action="pantry-del" data-id="${id}" aria-label="${esc(ing.name)}を使い切った">×</button></span>`;
    }).join('')}</p>` : '<p class="muted small">まだありません。「買った！記録する」を押すと、余った食材がここに入ります。</p>'}
    <details ${state.pantryOpen ? 'open' : ''} id="pantry-details">
      <summary class="small">＋ 家にある食材を追加</summary>
      <div class="br-edit">
        <label>食材 <select id="pt-id">${opts}</select></label>
        <label>量 <input type="number" id="pt-qty" min="0" step="any" placeholder="例：1"></label>
        <div class="br-actions"><button class="btn-soft" data-action="pantry-add">追加する</button></div>
      </div>
    </details>
  </div>`;
}

// ---------- 買った！の記録 ----------

function storeOptions(ingId, sel) {
  return STORES.map((s) => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.name}</option>`).join('');
}

function listRow(it, sid) {
  const ing = INGREDIENTS[it.id];
  const off = offerFor(sid, it.id);
  const b = state.bought[it.id];
  const planned = costAt(it, sid);
  const tags = `${it.fromPantry > 0 ? `<span class="tag-home">家の分 ${fmtQty(it.id, it.fromPantry)} も使う</span>` : ''}${off ? '<span class="tag-off">値引き</span>' : ''}${it.shared ? `<span class="tag-share">わけあい ${fmtFrac(it.factor)}</span>` : ''}`;
  const changed = b && !b.skipped && (b.store !== sid || b.price !== planned || b.packs !== it.packs);
  const note = b ? (b.skipped ? '<span class="chg">買わなかった</span>'
    : changed ? `<span class="chg">変更：${b.store !== sid ? storeById(b.store).name + '・' : ''}${b.packs !== it.packs ? b.packs + '個・' : ''}${yen(b.price)}</span>` : '') : '';
  const editing = state.editing === it.id;
  return `<li class="buy-row ${b ? (b.skipped ? 'is-skip' : 'is-done') : ''}">
    <div class="br-main">
      <button class="tick" data-action="tick" data-id="${it.id}" data-store="${sid}" aria-pressed="${!!b}" aria-label="${esc(ing.name)}を買った">${b ? '✓' : ''}</button>
      <span class="br-name">${esc(ing.name)}<span class="muted small">（${esc(ing.packLabel)}${it.packs > 1 ? '×' + it.packs : ''}）</span>${tags}${note}</span>
      <span class="num br-price">${b && !b.skipped ? yen(b.price) : yen(planned)}</span>
      <button class="link small" data-action="edit-bought" data-id="${it.id}" data-store="${sid}">${editing ? '閉じる' : '変更'}</button>
    </div>
    ${editing ? `<div class="br-edit">
      <label>お店 <select data-be="store" data-id="${it.id}">${storeOptions(it.id, b ? b.store : sid)}</select></label>
      <label>個数 <input type="number" min="1" step="1" data-be="packs" data-id="${it.id}" value="${b ? b.packs : it.packs}"></label>
      <label>払った金額 <input type="number" min="0" step="1" data-be="price" data-id="${it.id}" value="${b && !b.skipped ? b.price : planned}"> 円</label>
      <div class="br-actions">
        <button class="btn" data-action="save-bought" data-id="${it.id}">買った（この内容で）</button>
        <button class="btn-soft" data-action="skip-bought" data-id="${it.id}">買わなかった</button>
      </div>
    </div>` : ''}
  </li>`;
}

function extrasBlock() {
  const ex = state.extras;
  const opts = Object.entries(INGREDIENTS).map(([id, ing]) => `<option value="${id}">${esc(ing.name)}（${esc(ing.packLabel)}）</option>`).join('') + '<option value="__other">その他（一覧にないもの）</option>';
  return `<div class="extras">
    ${ex.length ? `<ul>${ex.map((e, i) => `<li><span>${esc(e.id ? INGREDIENTS[e.id].name : e.name)}<span class="muted small">（${storeById(e.store).name}・${e.packs}個）</span><span class="chg">リスト外</span></span><span class="num">${yen(e.price)}</span><button class="link small" data-action="del-extra" data-i="${i}">消す</button></li>`).join('')}</ul>` : ''}
    <details ${state.extraOpen ? 'open' : ''} id="extra-details">
      <summary class="small">＋ リストにないものを買った</summary>
      <div class="br-edit">
        <label>食材 <select id="ex-id">${opts}</select></label>
        <label id="ex-name-wrap" hidden>品名 <input type="text" id="ex-name" maxlength="30" placeholder="例：大根、お菓子"></label>
        <label>お店 <select id="ex-store">${STORES.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
        <label>個数 <input type="number" id="ex-packs" min="1" step="1" value="1"></label>
        <label>払った金額 <input type="number" id="ex-price" min="0" step="1" placeholder="例：198"> 円</label>
        <div class="br-actions"><button class="btn-soft" data-action="add-extra">追加する</button></div>
      </div>
    </details>
  </div>`;
}

function buyBar(items, plan) {
  const done = items.filter((it) => state.bought[it.id]).length;
  const any = done + state.extras.length;
  const actual = items.reduce((a, it) => { const b = state.bought[it.id]; return a + (b && !b.skipped ? b.price : 0); }, 0) + state.extras.reduce((a, e) => a + e.price, 0);
  return `<div class="buybar">
    <div><span class="small muted">買ったもの</span><span class="num"><b>${done}</b> / ${items.length}品${state.extras.length ? ` ＋${state.extras.length}` : ''}</span></div>
    <div><span class="small muted">実際に払った</span><span class="num"><b>${yen(actual)}</b></span></div>
    <div class="bb-actions">
      ${done < items.length ? '<button class="btn-soft" data-action="tick-all">ぜんぶ買った</button>' : ''}
    </div>
  </div>
  <p class="muted small bb-hint">${any ? '買い終わったら、画面の下の「買った！記録する」を押してください。' : '買ったものに ✓ をつけていきましょう。'}</p>`;
}

function recordedBanner() {
  const r = state.justRecorded;
  const diff = r.actual - r.planned;
  return `<div class="recorded">
    <p><b>記録しました。</b>${r.lines.length ? `実際 ${yen(r.actual)}（予定 ${yen(r.planned)}、${diff === 0 ? '予定どおり' : diff < 0 ? yen(-diff) + ' 安く買えた' : yen(diff) + ' 多かった'}）。買った価格で価格メモも更新しました。` : '家にある食材を使いました。'}</p>
    <p>献立はリセットしました。${r.restCount ? `余る食材 ${r.restCount}品は「家にある食材」に入れたので、次の献立では先に使って、足りない分だけを買い物リストに出します。` : ''}</p>
    <p><button class="link small" data-action="go-history">きろくを見る</button>　<button class="link small" data-action="close-banner">閉じる</button></p>
  </div>`;
}

function recordPurchase() {
  const lp = state.lastPlan;
  if (!lp) return;
  const d = new Date();
  const stamp = `${d.getMonth() + 1}/${d.getDate()}`;
  const lines = [];
  const skipped = [];
  // 家にある食材：献立で使う分を引き、買って余る分を足す
  const pantry = { ...state.pantry };
  const added = new Set();
  lp.all.forEach((it) => {
    const ing = INGREDIENTS[it.id];
    let rest = (pantry[it.id] || 0) - it.fromPantry;
    const b = state.bought[it.id];
    if (b && !b.skipped) {
      const plannedStore = lp.plan ? lp.plan.assign[it.id] : null;
      const got = b.packs * ing.pack * (it.shared && b.store === plannedStore ? it.factor : 1);
      if (got - it.buy > ing.pack * 0.03) { rest += got - it.buy; added.add(it.id); }
    }
    pantry[it.id] = rest;
  });
  state.extras.forEach((e) => { if (!e.id) return; pantry[e.id] = (pantry[e.id] || 0) + e.packs * INGREDIENTS[e.id].pack; added.add(e.id); });
  for (const id of Object.keys(pantry)) if (!(pantry[id] > INGREDIENTS[id].pack * 0.03)) delete pantry[id];
  added.forEach((id) => { if (pantry[id]) state.pantryDates[id] = d.toISOString(); });
  for (const id of Object.keys(state.pantryDates)) if (!pantry[id]) delete state.pantryDates[id];

  lp.items.forEach((it) => {
    const b = state.bought[it.id];
    if (!b) return;
    const name = INGREDIENTS[it.id].name;
    if (b.skipped) { skipped.push(name); return; }
    const plannedStore = lp.plan.assign[it.id];
    const changed = b.store !== plannedStore || b.packs !== it.packs || b.price !== costAt(it, plannedStore);
    lines.push({ name, store: storeById(b.store).name, price: b.price, packs: b.packs, changed });
    // 実際に払った金額から1パックの値段を出して、価格メモを更新
    const perPack = Math.round(b.price / (b.packs * (b.store === plannedStore ? (it.factor || 1) : 1)));
    if (perPack > 0 && state.prices[it.id]) { state.prices[it.id][b.store] = perPack; state.priceDates[it.id + ':' + b.store] = stamp + ' 購入'; }
  });
  state.extras.forEach((e) => {
    lines.push({ name: e.id ? INGREDIENTS[e.id].name : e.name, store: storeById(e.store).name, price: e.price, packs: e.packs, changed: true, extra: true });
    if (!e.id) return;
    const perPack = Math.round(e.price / e.packs);
    if (perPack > 0 && state.prices[e.id]) { state.prices[e.id][e.store] = perPack; state.priceDates[e.id + ':' + e.store] = stamp + ' 購入'; }
  });
  const planned = lp.items.filter((it) => state.bought[it.id] && !state.bought[it.id].skipped).reduce((a, it) => a + costAt(it, lp.plan.assign[it.id]), 0);
  const actual = lines.reduce((a, l) => a + l.price, 0);
  const rec = {
    at: d.toISOString(),
    label: lp.plan ? lp.plan.stores.map((id) => storeById(id).name).join(' → ') : '買い物なし（家にある食材）',
    dishes: RECIPES.filter((r) => state.counts[r.id]).map((r) => r.name + (state.counts[r.id] > 1 ? '×' + state.counts[r.id] : '')),
    planned, actual, lines, skipped, restCount: Object.keys(pantry).length,
  };
  state.history.unshift(rec);
  if (Object.keys(state.counts).length) {
    state.menuLog = [{ at: d.toISOString(), counts: { ...state.counts } }, ...(state.menuLog || [])].slice(0, 50);
  }
  state.pantry = pantry;
  state.bought = {};
  state.extras = [];
  state.editing = null;
  // 献立をリセット
  state.counts = {};
  state.shares = {};
  state.tagFilter = 'all';
  state.step = 4;
  state.justRecorded = rec;
}

function renderHistory() {
  const h = state.history;
  const box = $('#history-view');
  if (!h.length) {
    box.innerHTML = '<div class="empty"><p>まだ記録がありません。<br>「かいもの」の買い物リストで ✓ をつけて「買った！記録する」を押すと、ここに残ります。</p></div>';
    return;
  }
  const total = h.reduce((a, r) => a + r.actual, 0);
  const diff = h.reduce((a, r) => a + (r.actual - r.planned), 0);
  box.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span class="muted small">記録した買い物</span><span class="mid num">${h.length}<small>回</small></span></div>
      <div class="kpi"><span class="muted small">払った金額の合計</span><span class="mid num">${yen(total)}</span></div>
      <div class="kpi"><span class="muted small">予定との差</span><span class="mid num">${diff <= 0 ? '−' + yen(-diff) : '+' + yen(diff)}</span></div>
    </div>
    <div class="hist">${h.map((r, i) => {
      const d = new Date(r.at);
      const df = r.actual - r.planned;
      return `<article class="h-card">
        <div class="h-head">
          <p class="h-date num">${d.getMonth() + 1}/${d.getDate()} <span class="muted small">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span></p>
          <p class="h-sum"><span class="num big2">${yen(r.actual)}</span><span class="small ${df <= 0 ? 'good' : 'warn'}">予定 ${yen(r.planned)}（${df === 0 ? '±0' : df < 0 ? '−' + yen(-df) : '+' + yen(df)}）</span></p>
        </div>
        <p class="small muted">${esc(r.label)}${r.dishes && r.dishes.length ? '・' + r.dishes.map(esc).join('、') : ''}</p>
        <details><summary class="small">買ったもの ${r.lines.length}品${r.skipped.length ? `・買わなかった ${r.skipped.length}品` : ''}</summary>
          <ul class="h-lines">${r.lines.map((l) => `<li><span>${esc(l.name)}<span class="muted small">（${esc(l.store)}・${l.packs}個）</span>${l.extra ? '<span class="chg">リスト外</span>' : l.changed ? '<span class="chg">変更あり</span>' : ''}</span><span class="num">${yen(l.price)}</span></li>`).join('')}</ul>
          ${r.skipped.length ? `<p class="small muted">買わなかった：${r.skipped.map(esc).join('、')}</p>` : ''}
        </details>
        <button class="link small" data-action="del-history" data-i="${i}">${state.confirmDel === i ? 'もう一度押すと消えます' : 'この記録を消す'}</button>
      </article>`;
    }).join('')}</div>`;
}

function renderLeftover(items, all) {
  const rest = restList(all);
  const info = leftoverInfo(rest);
  const sugg = suggestions(rest);
  state.ptabInfo.rest = info.risky.length;
  const chip = (e) => `<span class="lo-chip lo-${e.ing.keep}">${e.ing.name} ${fmtQty(e.id, e.leftover)}</span>`;
  const box = $('#leftover');
  const shareable = items.filter((it) => it.canShare);
  const cheapestStore = (id) => STORES.filter((s) => priceOf(id, s.id) !== null).sort((a, b) => priceOf(id, a.id) - priceOf(id, b.id))[0];
  const needProfile = SETTINGS.shareScope !== 'off' && !shareGroup();
  const shareBlock = shareable.length ? `<div class="share-block">
      <p class="lo-title">近くの人と「わけあい」で買う</p>
      ${needProfile ? `<div class="share-need">
        <p class="small">わけあう相手を見つけるために、アカウントで${SETTINGS.shareScope === 'dorm' ? '住んでいる寮' : '大学・キャンパス'}を登録してください。同じ${SETTINGS.shareScope === 'dorm' ? '寮' : 'キャンパス'}の人とだけマッチングします。</p>
        <button class="btn-soft" data-action="go-tab" data-k="account">登録する</button>
      </div>` : `<p class="muted small">使い切れない分を、<b>${esc(shareLabel())}</b>の利用者と分けて買えます。未開封のまま受け渡します${SETTINGS.sharePlace ? `（受け渡し：${esc(SETTINGS.sharePlace)}）` : ''}。</p>`}
      <ul>${shareable.map((it) => {
        const ing = INGREDIENTS[it.id];
        const st = cheapestStore(it.id);
        const full = st ? priceOf(it.id, st.id) * it.packs : 0;
        const portion = it.shared ? it.factor : (Math.ceil((it.need / ing.pack) * 4 - 1e-9) / 4) / it.packs;
        const mine = Math.round(full * portion);
        const n = SHARE_DEMO[it.id] || 1;
        return `<li class="${it.shared ? 'is-on' : ''}">
          <div>
            <b>${esc(ing.name)}</b> <span class="muted small">${esc(ing.packLabel)}${it.packs > 1 ? '×' + it.packs : ''}のうち ${fmtFrac(portion)} だけ</span>
            <span class="small">${yen(full)} → <b>${yen(mine)}</b>　<span class="muted">${needProfile ? '登録すると、わけあう相手を探せます' : `${esc(shareLabel())}で ${n}人 が希望（デモ）`}</span></span>
          </div>
          <button class="${it.shared ? 'btn' : 'btn-soft'}" data-action="toggle-share" data-id="${it.id}" ${needProfile && !it.shared ? 'disabled' : ''}>${it.shared ? 'わけあい中' : 'わけあう'}</button>
        </li>`;
      }).join('')}</ul>
    </div>` : '';

  $('#sugg-box').innerHTML = sugg.length ? `<section class="sugg-hero" aria-labelledby="sugg-title">
      <div class="sh-head">
        <svg class="sh-icon" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 24h32c0 9-7 16-16 16S8 33 8 24z" fill="#fdf3dc" stroke="#24323a" stroke-width="2"/>
          <path d="M18 20c-2-5 1-9 4-11M26 20c0-4 3-8 7-9" stroke="#5fa77f" stroke-width="2.4"/>
          <path d="M14 30c4 2 16 2 20 0" stroke="#24323a" stroke-width="1.4" opacity=".4"/>
        </svg>
        <div>
          <p class="sh-kicker">使い切りのおすすめ</p>
          <h3 id="sugg-title">残りを使い切るなら、この献立もどう？</h3>
          <p class="small muted">このままだと ${info.risky.map((e) => esc(e.ing.name)).join('・') || '食材'} が余りそうです。足すと、ムダなく使い切れます。</p>
        </div>
      </div>
      <div class="sh-list">${sugg.map((s) => `<div class="sh-card">
        <div class="sh-main">
          <p class="sh-name">${esc(s.r.name)}</p>
          <p class="sh-uses">${s.used.map((u) => `<span class="lo-chip lo-short">${esc(INGREDIENTS[u.id].name)} ${fmtQty(u.id, u.q)}を使う</span>`).join('')}</p>
          <p class="small muted">${s.extra.length ? '買い足し：' + s.extra.map((id) => INGREDIENTS[id].name).join('・') : '買い足しなしで作れます'}${s.saved >= 1 ? `<span class="sh-save">約${yen(s.saved)}分のムダを防げる</span>` : ''}</p>
        </div>
        <button class="btn sh-add" data-action="inc" data-id="${s.r.id}">＋ 足す</button>
      </div>`).join('')}</div>
    </section>` : '';

  if (!info.risky.length && !info.frozen.length && !info.keeps.length) {
    box.innerHTML = `<div class="done"><p>買った食材をちょうど使い切れる献立です。</p></div>${shareBlock}`;
    return;
  }
  box.innerHTML = `
    ${info.risky.length ? `<div class="lo-block risk">
      <p class="lo-title">早めに使いたい残り</p>
      <p>${info.risky.map(chip).join('')}</p>
      <p class="muted small">このままだと約 <b>${yen(info.lossValue)}</b> 分が使い切れないかもしれません。</p>
    </div>` : `<div class="done"><p>日持ちしない食材は使い切れます。</p></div>`}
    ${sugg.length ? '<p class="small sugg-pointer">↑ 上の「この献立もどう？」から足すと、残りを使い切れます。</p>' : ''}
    ${shareBlock || info.frozen.length || info.keeps.length ? `<details class="lo-more" id="lo-more" ${state.loMore ? 'open' : ''}>
      <summary>近くの人とわけあう・残りの保存のしかた</summary>
      ${shareBlock}
      ${info.frozen.length ? `<div class="lo-block"><p class="lo-title">冷凍しておけば大丈夫</p><p>${info.frozen.map(chip).join('')}</p></div>` : ''}
      ${info.keeps.length ? `<div class="lo-block"><p class="lo-title">日持ちするので次回へ</p><p>${info.keeps.map(chip).join('')}</p></div>` : ''}
    </details>` : ''}
  `;
}

// ---------- 描画：お店の画面 ----------

function hourlyVisitors(sid) {
  const out = {};
  for (const [h, v] of Object.entries(HOURLY_BASE)) out[h] = Math.round(v * HOURLY_SCALE[sid]);
  return out;
}

// 値引きを一斉に配信せず、来店が少ない時間帯3つに分けて配信する
function offerSlots(sid, excess) {
  const v = hourlyVisitors(sid);
  const respond = Math.max(3, Math.round(excess * 0.7));
  const hours = Object.keys(v).map(Number).filter((h) => h >= 14 && h <= 20).sort((a, b) => v[a] - v[b]).slice(0, 3).sort((a, b) => a - b);
  const limit = Math.ceil(respond / hours.length);
  return { respond, slots: hours.map((h) => ({ h, limit })) };
}

function renderStore() {
  const sid = state.viewStore;
  const s = storeById(sid);
  const rows = storeDemand(sid);
  const users = Math.round(REGION_USERS * STORE_SHARE[sid]);
  const max = Math.max(...rows.map((r) => Math.max(r.demand, r.stock)));
  const risk = rows.filter((r) => r.status === 'risk');
  const short = rows.filter((r) => r.status === 'short');

  let lossBefore = 0, lossAfter = 0;
  risk.forEach((r) => {
    const v = r.excess * basePrice(r.id, sid);
    lossBefore += v;
    lossAfter += offerFor(sid, r.id) ? v * 0.3 : v;
  });

  const ranking = RECIPES.map((r) => ({ r, n: Math.round(users * r.pop) })).sort((a, b) => b.n - a.n).slice(0, 5);

  const label = { ok: 'ちょうど', short: '足りない', risk: '売れ残りそう', extra: '多め（日持ちOK）' };

  const welcome = MY_STORE && !AUTH.user.staff && LS.get('kd-store-welcome', false) ? `<div class="store-welcome">
      <p><b>${esc(MY_STORE.name)}</b> の店舗アカウントを作りました。</p>
      <p class="small">いっしょに使うスタッフには、この店舗コードを伝えてください。スタッフはコードと名前だけで入れます（メールアドレスはいりません）。</p>
      <p class="store-code-big">${esc(MY_STORE.code)}</p>
      <button class="btn-soft" data-action="store-welcome-close">わかった</button>
    </div>` : '';
  $('#store-view').innerHTML = `${welcome}
    ${typeof storeLivePanel === 'function' ? storeLivePanel() : ''}
    ${MY_STORE ? `<div class="store-title" style="--store:${s.color}"><span class="dot"></span><b>${esc(MY_STORE.name)}</b><span class="muted small">${esc(currentArea().name)}</span></div>` : ''}
    <div class="kpis">
      <div class="kpi"><span class="muted small">明日来店しそうな献立登録者</span><span class="mid num">${users.toLocaleString()}<small>人</small></span></div>
      <div class="kpi"><span class="muted small">売れ残り見込み</span><span class="mid num">${yen(lossAfter)}</span>${lossAfter < lossBefore ? `<span class="small good">配信前 ${yen(lossBefore)} から減少</span>` : ''}</div>
      <div class="kpi"><span class="muted small">追加発注したい食材</span><span class="mid num">${short.length}<small>品目</small></span></div>
    </div>

    <div class="store-grid">
      <section class="panel">
        <h3>明日の需要予測と予定在庫 <span class="muted small">（パック数）</span></h3>
        <div class="legend"><span><i class="lg-demand"></i>需要予測</span><span><i class="lg-stock"></i>予定在庫</span></div>
        <ul class="bars">
          ${rows.map((r) => `<li class="st-${r.status}">
            <span class="b-name">${r.ing.name}</span>
            <span class="b-bars">
              <span class="bar demand" style="width:${(r.demand / max) * 100}%"></span>
              <span class="bar stock" style="width:${(r.stock / max) * 100}%"></span>
            </span>
            <span class="b-num num">${r.demand} / ${r.stock}</span>
            <span class="b-status">${label[r.status]}${r.status === 'short' ? ` +${r.demand - r.stock}` : ''}</span>
          </li>`).join('')}
        </ul>
      </section>

      <section class="panel">
        <h3>売れ残りそうな食材への提案</h3>
        ${risk.length ? crowdChart(sid, risk) : ''}
        ${risk.length ? risk.map((r) => storeOfferCard(r, sid)).join('') : '<p class="muted">売れ残りそうな食材はありません。</p>'}
        <h3 class="sub-h">この地域でよく作られる献立</h3>
        <ol class="ranking">${ranking.map((x) => `<li><span>${x.r.name}</span><span class="num muted">${x.n}人</span></li>`).join('')}</ol>
      </section>
    </div>
    ${offerResults(sid)}
    <p class="muted small foot-note">※ 需要予測・在庫・値引き後の売れ行き（配信で余りの7割が売れる想定）はデモ用の値です。配信すると「かいもの」画面のおすすめと価格に反映されます。</p>
  `;
}

// ---------- 配信（お店） ----------
const OFFER_HOURS = [14, 15, 16, 17, 18, 19, 20];

function newDraft(r, sid) {
  const plan = offerSlots(sid, r.excess);
  const recs = RECIPES.filter((x) => x.uses[r.id]).sort((a, b) => b.pop - a.pop);
  const slots = {};
  OFFER_HOURS.forEach((h) => { const p = plan.slots.find((x) => x.h === h); slots[h] = { on: !!p, limit: p ? p.limit : Math.max(1, Math.round(plan.respond / 3)) }; });
  return {
    ing: r.id, discount: r.ratio > 1.5 ? 0.3 : 0.2, slots, until: 'tomorrow',
    recipes: Object.fromEntries(recs.slice(0, 2).map((x) => [x.id, true])),
    msg: `${INGREDIENTS[r.id].name}が多めに入荷しています。${recs[0] ? `「${recs[0].name}」などにどうぞ。` : ''}`,
  };
}

function storeOfferCard(r, sid) {
  const live = offerFor(sid, r.id);
  const unit = r.ing.pack === 1 ? r.ing.unit : 'パック';
  const head = `<p><b>${r.ing.name}</b> が約 <b>${r.excess}</b> ${unit}余りそう <span class="muted small">（${yen(r.excess * basePrice(r.id, sid))}分）</span></p>`;
  if (live) {
    const taken = offerTaken(live);
    return `<div class="risk-card is-sent">
      ${head}
      <p class="small"><span class="live-dot"></span><b>配信中</b>　<span class="off">${Math.round(live.discount * 100)}%オフ</span>　<span class="muted">${fmtUntil(live.until)}</span></p>
      ${live.message ? `<p class="offer-msg small">「${esc(live.message)}」</p>` : ''}
      <p class="small">取り置き <b>${taken}</b> / ${live.qty}個　<span class="muted">受け取り済み ${(live.reservations || []).filter((x) => x.picked).length}個</span></p>
      <div class="take-bar"><span style="width:${Math.min(100, (taken / Math.max(1, live.qty)) * 100)}%"></span></div>
      <p class="small slot-line">${live.slots.map((x) => { const n = offerTaken(live, x.h); return `<span class="slot ${n >= x.limit ? 'is-full' : ''}">${x.h}時台 ${n}/${x.limit}${n >= x.limit ? ' 満' : ''}</span>`; }).join('')}</p>
      <div class="pickup-check">
        <label class="acc-label" for="pc-${live.id}">受け取りの確認 <span class="muted small">お客さんの4桁のコードを入力</span></label>
        <div class="acc-inline"><input id="pc-${live.id}" class="pc-input" type="text" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off"><button class="btn" data-action="offer-pickup" data-id="${live.id}">確認</button></div>
        ${state.pickupMsg && state.pickupMsg.id === live.id ? `<p class="small ${state.pickupMsg.ok ? 'good' : 'warn'}">${esc(state.pickupMsg.text)}</p>` : ''}
      </div>
      <button class="btn-soft" data-action="offer-stop" data-id="${live.id}">${state.confirmStop === live.id ? 'もう一度押すと配信を止めます' : '配信を止める'}</button>
    </div>`;
  }
  const d = state.draft && state.draft.ing === r.id ? state.draft : null;
  if (!d) {
    const plan = offerSlots(sid, r.excess);
    const recs = RECIPES.filter((x) => x.uses[r.id]).sort((a, b) => b.pop - a.pop).slice(0, 2);
    return `<div class="risk-card">
      ${head}
      <p class="muted small">提案：${r.ratio > 1.5 ? 30 : 20}%オフにして「${recs.map((x) => x.name).join('」「')}」と一緒にアプリでおすすめ</p>
      <p class="small slot-line">配信：${plan.slots.map((x) => `<span class="slot">${x.h}時台 ${x.limit}人</span>`).join('')}<span class="muted">取り置き予約つき</span></p>
      <button class="btn" data-action="offer-draft" data-ing="${r.id}">配信内容を決める</button>
    </div>`;
  }
  return offerEditor(r, sid, d);
}

function offerEditor(r, sid, d) {
  const v = hourlyVisitors(sid);
  const quiet = OFFER_HOURS.slice().sort((a, b) => v[a] - v[b]).slice(0, 3);
  const recs = RECIPES.filter((x) => x.uses[r.id]).sort((a, b) => b.pop - a.pop).slice(0, 4);
  const qty = OFFER_HOURS.reduce((a, h) => a + (d.slots[h].on ? d.slots[h].limit : 0), 0);
  const base = basePrice(r.id, sid);
  const unit = r.ing.pack === 1 ? r.ing.unit : 'パック';
  const pickedRecs = recs.filter((x) => d.recipes[x.id]);
  return `<div class="risk-card offer-editor">
    <p><b>${r.ing.name}</b> の配信内容 <span class="muted small">余りそう：約${r.excess}${unit}</span></p>

    <p class="acc-label">値引き</p>
    <div class="dr-pills">${[0.1, 0.2, 0.3, 0.4, 0.5].map((x) => `<button class="pill-s ${Math.abs(d.discount - x) < 0.001 ? 'is-on' : ''}" data-action="dr-discount" data-v="${x}">${Math.round(x * 100)}%</button>`).join('')}</div>
    <p class="muted small">${yen(base)} → <b>${yen(Math.round(base * (1 - d.discount)))}</b></p>

    <p class="acc-label">取り置きの時間帯と個数 <span class="muted small">空いている時間帯に分けると混みません</span></p>
    <div class="dr-slots">${OFFER_HOURS.map((h) => `<label class="dr-slot ${d.slots[h].on ? 'is-on' : ''}">
      <input type="checkbox" data-dr="slot-on" data-h="${h}" ${d.slots[h].on ? 'checked' : ''}>
      <span>${h}時台${quiet.includes(h) ? '<i class="quiet">すいている</i>' : ''}</span>
      <input type="number" min="1" max="99" data-dr="slot-limit" data-h="${h}" value="${d.slots[h].limit}" ${d.slots[h].on ? '' : 'disabled'}><span class="small">個</span>
    </label>`).join('')}</div>
    <p class="small">合計 <b>${qty}</b>個 ${qty > r.excess ? '<span class="warn">（余りそうな数より多いです）</span>' : `<span class="muted">（余りそうな数 ${r.excess}${unit}）</span>`}</p>

    <p class="acc-label">配信の期限</p>
    <select data-dr="until">${Object.entries(OFFER_UNTIL).map(([k, t]) => `<option value="${k}" ${d.until === k ? 'selected' : ''}>${t}</option>`).join('')}</select>

    <p class="acc-label">一緒におすすめする献立</p>
    <div class="dr-recipes">${recs.map((x) => `<label><input type="checkbox" data-dr="recipe" data-id="${x.id}" ${d.recipes[x.id] ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</div>

    <label class="acc-label" for="dr-msg">ひとことメッセージ <span class="muted small">（60文字まで）</span></label>
    <textarea id="dr-msg" data-dr="msg" maxlength="60" rows="2">${esc(d.msg)}</textarea>

    <p class="acc-label">利用者に見える内容</p>
    <div class="offer-card offer-preview"><div class="offer-row">
      <p><b>${esc(storeById(sid).name)}</b>で <b>${r.ing.name}</b> が <span class="off">${Math.round(d.discount * 100)}%オフ</span> <span class="muted">${yen(base)} → ${yen(Math.round(base * (1 - d.discount)))}</span></p>
      ${d.msg.trim() ? `<p class="offer-msg small">「${esc(d.msg.trim())}」</p>` : ''}
      <p class="offer-slot small">あなたへの配信枠：<b>${(OFFER_HOURS.find((h) => d.slots[h].on) || '-')}時台</b> などに分けて配信　<span class="chip">取り置きする</span></p>
      <p class="muted small">${fmtUntil(untilDate(d.until))}</p>
      <p class="offer-recipes">${pickedRecs.map((x) => `<span class="chip">＋ ${esc(x.name)}</span>`).join('')}</p>
    </div></div>

    ${state.draftMsg ? `<p class="small warn">${esc(state.draftMsg)}</p>` : ''}
    <div class="acc-actions">
      <button class="btn" data-action="offer-send" data-ing="${r.id}" data-excess="${r.excess}">この内容で配信する</button>
      <button class="btn-soft" data-action="offer-cancel">やめる</button>
    </div>
  </div>`;
}

function offerResults(sid) {
  const mine = state.offers.filter((o) => o.store === sid).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!mine.length) return '';
  const rows = mine.slice(0, 10).map((o) => {
    const taken = offerTaken(o);
    const bp = o.basePrice || basePrice(o.ing, sid) || 0;
    const sales = taken * Math.round(bp * (1 - o.discount));
    const saved = Math.min(taken, o.excess || taken) * bp;
    const st = offerLive(o) ? '<span class="r-live">配信中</span>' : o.status === 'ended' ? '<span class="r-end">止めた</span>' : '<span class="r-end">期限切れ</span>';
    const d = new Date(o.at);
    return { o, taken, sales, saved, html: `<tr>
      <td>${INGREDIENTS[o.ing] ? INGREDIENTS[o.ing].name : o.ing}<span class="muted small">${d.getMonth() + 1}/${d.getDate()}・${Math.round(o.discount * 100)}%オフ</span></td>
      <td>${st}</td>
      <td class="num">${taken}/${o.qty || '-'}<span class="muted small">${o.qty ? Math.round((taken / o.qty) * 100) + '%' : ''}</span></td>
      <td class="num">${yen(saved)}</td>
    </tr>` };
  });
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  return `<section class="panel offer-results">
    <h3>配信の結果</h3>
    <div class="kpis">
      <div class="kpi"><span class="muted small">配信した回数</span><span class="mid num">${rows.length}<small>回</small></span></div>
      <div class="kpi"><span class="muted small">取り置きされた数</span><span class="mid num">${sum('taken')}<small>個</small></span></div>
      <div class="kpi"><span class="muted small">防げた売れ残り</span><span class="mid num">${yen(sum('saved'))}</span><span class="small muted">取り置き分の売上 ${yen(sum('sales'))}</span></div>
    </div>
    <div class="table-wrap"><table class="r-table">
      <thead><tr><th>食材</th><th>状態</th><th>取り置き</th><th>防げた売れ残り</th></tr></thead>
      <tbody>${rows.map((x) => x.html).join('')}</tbody>
    </table></div>
    <p class="muted small">防げた売れ残り＝取り置きされた数（余りそうな数まで）× 元の価格。店頭で値引き価格で売れた分は入っていません。</p>
  </section>`;
}

function crowdChart(sid, risk) {
  const v = hourlyVisitors(sid);
  const respond = risk.reduce((a, r) => a + offerSlots(sid, r.excess).respond, 0);
  const slotAdd = {};
  risk.forEach((r) => offerSlots(sid, r.excess).slots.forEach((x) => { slotAdd[x.h] = (slotAdd[x.h] || 0) + x.limit; }));
  const peakH = Number(Object.keys(v).sort((a, b) => v[b] - v[a])[0]);
  const together = v[peakH] + respond;
  const spread = Math.max(...Object.keys(v).map((h) => v[h] + (slotAdd[h] || 0)));
  const max = Math.max(together, ...Object.values(v)) * 1.05;
  return `<div class="crowd">
    <p class="crowd-title">配信の時間をずらして、混雑を防ぐ</p>
    <div class="crowd-bars" role="img" aria-label="時間帯ごとの来店予測">
      ${Object.keys(v).map((h) => `<div class="cb">
        <span class="cb-stack" style="height:${((v[h] + (slotAdd[h] || 0)) / max) * 100}%">
          ${slotAdd[h] ? `<span class="cb-add" style="height:${(slotAdd[h] / (v[h] + slotAdd[h])) * 100}%"></span>` : ''}
        </span>
        <span class="cb-h">${h}</span>
      </div>`).join('')}
    </div>
    <div class="legend"><span><i class="lg-base"></i>いつもの来店予測</span><span><i class="lg-add"></i>値引きを見て来る人</span></div>
    <p class="small">値引きを一斉に流すと、${peakH}時台に約 <b>${together}人</b> が集中します。来店が少ない時間帯に分けて配信すると、いちばん混む時間帯でも約 <b>${spread}人</b> におさまります。</p>
  </div>`;
}

// ---------- レシートから価格を読み取る ----------

function parseReceipt(text) {
  const names = Object.entries(INGREDIENTS)
    .flatMap(([id, ing]) => [ing.name, ...(ALIASES[id] || [])].map((n) => ({ id, n: n.normalize('NFKC') })))
    .sort((a, b) => b.n.length - a.n.length);
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.normalize('NFKC');
    if (/小計|合計|お預|釣|税|ポイント|値引|割引|クーポン/.test(line)) continue;
    const hit = names.find((x) => line.includes(x.n));
    if (!hit || out.find((o) => o.id === hit.id)) continue;
    const nums = [...line.matchAll(/(\d[\d,]*)(?![\d,])(?!\s*(?:kg|g|ml|l|個|本|枚|切|入|p|パック|%|玉|束|袋|缶|丁))/gi)]
      .map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n >= 10 && n < 100000);
    if (!nums.length) continue;
    out.push({ id: hit.id, price: nums[nums.length - 1] });
  }
  return out;
}

async function startReceiptOcr(file) {
  const rc = state.receipt;
  rc.result = null;
  rc.ocr = { busy: true, stage: 'prepare', pct: 0 };
  renderPrices();
  let last = 0;
  try {
    const out = await readReceiptImage(file, (p) => {
      Object.assign(rc.ocr, p);
      const now = Date.now();
      if (now - last > 250) { last = now; if (state.tab === 'prices') renderPrices(); }
    });
    rc.text = out.text;
    // レシートにお店の名前があれば、お店を自動でえらぶ
    const flat = out.text.replace(/\s/g, '').normalize('NFKC');
    const hit = STORES.find((st) => flat.includes(st.name.split(/\s/)[0].normalize('NFKC')));
    if (hit) rc.store = hit.id;
    rc.ocr = { done: true, preview: out.preview, found: parseReceipt(out.text).length };
  } catch (e) {
    rc.ocr = { error: (e && e.message) || '読み取れませんでした。', preview: rc.ocr && rc.ocr.preview };
    if (!navigator.onLine) rc.ocr.error = '初回の読み取りにはインターネット接続が必要です。';
  }
  if (state.tab === 'prices') renderPrices();
}

function applyReceipt() {
  const r = state.receipt;
  const found = parseReceipt(r.text);
  const d = new Date();
  const stamp = `${d.getMonth() + 1}/${d.getDate()}`;
  r.result = found.map((f) => {
    const before = basePrice(f.id, r.store);
    state.prices[f.id][r.store] = f.price;
    state.priceDates[f.id + ':' + r.store] = stamp;
    return { ...f, before };
  });
  save();
}

// ---------- 描画：価格メモ ----------

function renderPrices() {
  const rows = Object.entries(INGREDIENTS).map(([id, ing]) => `
    <tr>
      <th>${ing.name}<span class="muted small">${ing.packLabel}</span></th>
      ${STORES.map((s) => {
        const v = basePrice(id, s.id);
        const min = Math.min(...STORES.map((x) => basePrice(id, x.id)).filter((x) => x !== null));
        const date = state.priceDates[id + ':' + s.id];
        return `<td class="${v !== null && v === min ? 'is-min' : ''}"><input type="number" min="0" inputmode="numeric" data-ing="${id}" data-store="${s.id}" value="${v === null ? '' : v}" placeholder="なし" aria-label="${esc(ing.name)} ${s.name}">${date ? `<span class="p-date">${date} レシート</span>` : ''}</td>`;
      }).join('')}
    </tr>`).join('');
  const rc = state.receipt;
  $('#price-view').innerHTML = `
    <div class="receipt">
      <h3>レシートから価格を更新</h3>
      <p class="muted small">レシートをカメラで撮るか、写真をえらぶと、文字を読み取って食材の価格を更新します。画像はこの端末の中だけで読み取り、どこにも送りません。</p>
      <div class="rc-cam">
        <label class="btn rc-shot"><input type="file" id="rc-camera" accept="image/*" capture="environment" hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.3" r="3.4"/></svg>
          カメラで撮る</label>
        <label class="btn-soft rc-pick"><input type="file" id="rc-photo" accept="image/*" hidden>写真をえらぶ</label>
      </div>
      ${rc.ocr ? `<div class="rc-ocr">
        ${rc.ocr.preview ? `<img src="${rc.ocr.preview}" alt="読み取ったレシート">` : ''}
        <div>
          ${rc.ocr.busy ? `<p class="small">${rc.ocr.stage === 'read' ? 'レシートを読み取っています' : rc.ocr.stage === 'load' ? '文字認識の準備をしています（初回は少し時間がかかります）' : '画像を整えています'}… ${rc.ocr.pct || 0}%</p>
            <div class="rc-bar"><span style="width:${rc.ocr.pct || 0}%"></span></div>` : ''}
          ${rc.ocr.error ? `<p class="small warn">${esc(rc.ocr.error)}</p>` : ''}
          ${rc.ocr.done ? `<p class="small">読み取りました。下の文字を確認して、まちがいがあれば直してから「この内容で価格を更新」を押してください。${rc.ocr.found ? `<br><b>${rc.ocr.found}品目</b>の食材が見つかりました。` : '<br>食材が見つかりませんでした。明るい場所で、レシートをまっすぐ撮りなおすと読み取りやすくなります。'}</p>` : ''}
        </div>
      </div>` : ''}
      <details class="rc-manual" ${rc.text || rc.ocr ? 'open' : ''}>
        <summary class="small">読み取った文字を確認・直す（文字を貼り付けることもできます）</summary>
      <div class="rc-row">
        <label for="rc-store" class="small">お店</label>
        <select id="rc-store" data-rc="store">${STORES.map((s) => `<option value="${s.id}" ${s.id === rc.store ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
        <button class="link small" data-action="receipt-sample">サンプルのレシートを入れる</button>
      </div>
      <textarea id="rc-text" data-rc="text" rows="6" placeholder="例）若鶏もも肉 300g ¥428">${esc(rc.text)}</textarea>
      <button class="btn" data-action="receipt-read">この内容で価格を更新</button>
      </details>
      ${rc.result ? (rc.result.length ? `<ul class="rc-result">${rc.result.map((x) => `<li><span>${esc(INGREDIENTS[x.id].name)}</span><span class="num">${x.before === null ? 'なし' : yen(x.before)} → <b>${yen(x.price)}</b></span></li>`).join('')}</ul><p class="small good">${storeById(rc.store).name}の価格を ${rc.result.length}品目 更新しました。</p>` : '<p class="small">読み取れる食材が見つかりませんでした。食材名と価格が同じ行にあるか確認してください。</p>') : ''}
    </div>
    <p class="lead">よく行くお店の価格をメモしておくと、計算に使われます。空欄は「その店では売っていない」扱いです。</p>
    <div class="table-wrap">
      <table class="prices">
        <thead><tr><th></th>${STORES.map((s) => `<th style="--store:${s.color}"><span class="dot"></span>${s.name}<span class="muted small">${moveLabel(s)}</span></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <button class="btn-soft" data-action="reset-prices">サンプルの価格に戻す</button>
  `;
}

// ---------- 献立を追加する（手入力 + AI） ----------

const clean = (t) => String(t || '').replace(/[<>&"'`]/g, '').trim().slice(0, 40);
const TAGS = ['主菜', '主食', '汁物', '副菜'];
const UNITS = ['g', 'ml', '個', '本', '枚', '玉', '束', '袋', 'パック', '丁', '缶', '切れ'];

function formIng(id) {
  return INGREDIENTS[id] || state.form.pending[id] || null;
}

function renderForm() {
  const f = state.form;
  const box = $('#add-form');
  if (!f.open) {
    box.innerHTML = `<button class="add-open" data-action="form-open">＋ 献立を追加する <span class="muted small">名前を入れるとAIが食材を考えます</span></button>`;
    return;
  }
  const options = (sel) => {
    const base = Object.entries(INGREDIENTS)
      .map(([id, ing]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(ing.name)}（${ing.unit}）</option>`).join('');
    const pend = Object.entries(f.pending)
      .map(([id, ing]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(ing.name)}（${ing.unit}）・新しい食材</option>`).join('');
    return `<option value="">食材をえらぶ</option>${pend}${base}`;
  };
  const rows = f.rows.map((row, i) => {
    const ing = formIng(row.id);
    const isNew = !!f.pending[row.id];
    return `<div class="f-row">
      <select data-row="${i}" data-k="id" aria-label="食材">${options(row.id)}</select>
      <input type="number" min="0" step="any" inputmode="decimal" data-row="${i}" data-k="qty" value="${row.qty}" placeholder="分量" aria-label="分量">
      <span class="f-unit">${ing ? ing.unit : ''}</span>
      <button class="f-del" data-action="row-del" data-i="${i}" aria-label="この行を消す">×</button>
      ${isNew ? `<p class="f-new muted small">価格表にない食材です。目安：${esc(ing.packLabel)} ${yen(ing.prices.A)}（あとで価格メモで直せます）</p>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = `<div class="add-card">
    <div class="f-head">
      <h3>献立を追加する</h3>
      <button class="link small" data-action="form-close">閉じる</button>
    </div>
    <div class="f-name">
      <input type="text" data-f="name" value="${esc(f.name)}" placeholder="例：麻婆なす、豚汁" aria-label="献立名" maxlength="40">
      <button class="btn" data-action="ai-fill" ${f.busy ? 'disabled' : ''}>${f.busy ? '考え中…' : 'AIで食材を入れる'}</button>
    </div>
    ${f.status ? `<p class="f-status small">${f.status}</p>` : ''}
    <div class="f-tags">
      ${TAGS.map((t) => `<label class="f-tag"><input type="radio" name="f-tag" data-f="tag" value="${t}" ${f.tag === t ? 'checked' : ''}><span data-tag="${t}">${t}</span></label>`).join('')}
    </div>
    <p class="muted small">食材と分量（1人分）。米と調味料は入れなくて大丈夫です。</p>
    <div class="f-rows">${rows}</div>
    <button class="link small" data-action="row-add">＋ 食材を足す</button>
    <div class="f-actions">
      <button class="btn" data-action="form-save">保存してえらぶ</button>
    </div>
    <details class="f-ai">
      <summary class="small">AIの設定</summary>
      <p class="muted small">Anthropic のAPIキーを入れると、どんな献立名でもAIが食材と分量を考えます。キーはこのブラウザの中だけに保存されます。キーがないときは、デモ用の辞書（麻婆なす・豚汁・ハンバーグなど）から推定します。</p>
      <label class="small">APIキー <input type="password" data-ai="key" value="${esc(state.ai.key)}" placeholder="sk-ant-..." autocomplete="off"></label>
      <label class="small">モデル <input type="text" data-ai="model" value="${esc(state.ai.model)}"></label>
    </details>
  </div>`;
}

function dictionaryLookup(name) {
  const n = name.replace(/\s/g, '');
  const hit = DISH_DICTIONARY.find((d) => d.keys.some((k) => n.includes(k) || k.includes(n) && n.length >= 2));
  return hit || null;
}

async function askAI(name) {
  const list = Object.entries(INGREDIENTS).map(([id, ing]) => `${id}: ${ing.name}（単位 ${ing.unit}）`).join('\n');
  const prompt = `一人暮らしの自炊向けに、「${name}」1人分の材料を考えてください。米・調味料・油・小麦粉・パン粉などの常備品は除きます。
次の食材リストにあるものは、そのidと単位で分量を答えてください。
${list}

リストにない食材は new に入れ、日本のスーパーでの一般的な売り方（1パックの量）と税込の目安価格も答えてください。
返答はJSONだけにしてください。形式：
{"name":"献立名","tag":"主菜|主食|汁物|副菜のどれか","uses":[{"id":"リストのid","qty":数値}],"new":[{"name":"食材名","unit":"${UNITS.join('|')}のどれか","qty":数値,"pack":1パックの量(数値),"packLabel":"例: 3本入り","price":数値,"keep":"short|freeze|long"}]}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': state.ai.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: state.ai.model, max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AIへの接続に失敗しました（${res.status}）`);
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return json;
}

function applyAIResult(json) {
  const f = state.form;
  if (json.name && !f.name) f.name = clean(json.name);
  if (TAGS.includes(json.tag)) f.tag = json.tag;
  const rows = [];
  (json.uses || []).forEach((u) => {
    if (INGREDIENTS[u.id] && Number(u.qty) > 0) rows.push({ id: u.id, qty: Number(u.qty) });
  });
  f.pending = {};
  (json.new || []).forEach((n, i) => {
    const name = clean(n.name);
    if (!name || !(Number(n.qty) > 0)) return;
    // 同じ名前の食材がすでにあれば、それを使う
    const exist = Object.entries(INGREDIENTS).find(([, ing]) => ing.name === name);
    if (exist) { rows.push({ id: exist[0], qty: Number(n.qty) }); return; }
    const id = `c_${Date.now().toString(36)}_${i}`;
    const unit = UNITS.includes(n.unit) ? n.unit : '個';
    const price = Math.max(1, Math.round(Number(n.price) || 150));
    f.pending[id] = {
      name, unit, pack: Number(n.pack) > 0 ? Number(n.pack) : 1, packLabel: clean(n.packLabel) || '1パック',
      keep: ['short', 'freeze', 'long'].includes(n.keep) ? n.keep : 'short',
      prices: { A: price, B: price, C: null }, custom: true,
    };
    rows.push({ id, qty: Number(n.qty) });
  });
  f.rows = rows.length ? rows : [{ id: '', qty: '' }];
}

async function aiFill() {
  const f = state.form;
  const name = clean(f.name);
  if (!name) { f.status = '先に献立名を入れてください。'; renderForm(); return; }
  if (state.ai.key) {
    f.busy = true; f.status = ''; renderForm();
    try {
      applyAIResult(await askAI(name));
      f.status = 'AIが食材と分量を入れました。必要なら直してから保存してください。';
    } catch (e) {
      const d = dictionaryLookup(name);
      if (d) { applyDict(d); f.status = `${e.message}。かわりにデモ用の辞書から入れました。`; } else f.status = `${e.message}。APIキーとモデル名を確認するか、食材を手で入れてください。`;
    }
    f.busy = false; renderForm(); return;
  }
  const d = dictionaryLookup(name);
  if (d) { applyDict(d); f.status = 'デモ用の辞書から食材と分量を入れました（APIキーを設定すると、どんな献立でもAIが考えます）。'; } else f.status = 'デモ用の辞書にない献立です。下の「AIの設定」でAPIキーを入れるか、食材を手で入れてください。';
  renderForm();
}

function applyDict(d) {
  const f = state.form;
  f.tag = d.tag;
  f.pending = {};
  f.rows = Object.entries(d.uses).map(([id, qty]) => ({ id, qty }));
}

function saveForm() {
  const f = state.form;
  const name = clean(f.name);
  const rows = f.rows.filter((r) => r.id && Number(r.qty) > 0);
  if (!name) { f.status = '献立名を入れてください。'; renderForm(); return; }
  if (!rows.length) { f.status = '食材と分量を1つ以上入れてください。'; renderForm(); return; }
  const uses = {};
  rows.forEach((r) => {
    if (f.pending[r.id] && !INGREDIENTS[r.id]) {
      INGREDIENTS[r.id] = f.pending[r.id];
      customIngs[r.id] = f.pending[r.id];
      state.prices[r.id] = { ...f.pending[r.id].prices };
    }
    uses[r.id] = (uses[r.id] || 0) + Number(r.qty);
  });
  const recipe = { id: `u_${Date.now().toString(36)}`, name, tag: f.tag, pop: 0, uses, custom: true };
  RECIPES.push(recipe);
  customRecipes.push(recipe);
  state.counts[recipe.id] = 1;
  state.form = emptyForm();
  save();
  renderForm();
  render();
}

function deleteRecipe(id) {
  const i = RECIPES.findIndex((r) => r.id === id && r.custom);
  if (i >= 0) RECIPES.splice(i, 1);
  const j = customRecipes.findIndex((r) => r.id === id);
  if (j >= 0) customRecipes.splice(j, 1);
  delete state.counts[id];
}

// ---------- アカウント ----------

function renderStoreAccount() {
  const u = AUTH.user;
  const accs = AUTH.accounts();
  const created = u.createdAt ? new Date(u.createdAt) : null;
  const areaName = MY_STORE ? ((AREAS.find((x) => x.id === MY_STORE.area) || {}).name || '') : '';
  $('#account-view').innerHTML = `<div class="acc-grid">
    <section class="acc-card">
      <h3>店舗</h3>
      ${MY_STORE ? `<p><b>${esc(MY_STORE.name)}</b> <span class="muted small">${esc(areaName)}</span></p>
        ${u.staff ? '<p class="muted small">店舗コードは、担当者だけが確認・変更できます。わからないときは担当者に聞いてください。</p>' : `<p class="acc-label">店舗コード</p>
        <div class="acc-inline"><span class="store-code">${esc(MY_STORE.code)}</span><button class="link small" data-action="store-copy-code">${state.copied ? 'コピーしました' : 'コピー'}</button></div>
        <p class="muted small">スタッフはこのコードと名前で入ります。担当者も、スタッフがいるときはログインにこのコードが必要です。いっしょに使う人にだけ伝えてください。</p>
        <button class="btn-soft" data-action="store-new-code">${state.confirmAcc === 'code' ? 'もう一度押すと作りなおします' : 'コードを作りなおす'}</button>
        ${state.confirmAcc === 'code' ? '<p class="small warn">作りなおすと、前のコードではログインできなくなります。</p>' : ''}`}`
        : '<p class="small warn">店舗の登録が見つかりません。ログアウトして、もう一度登録してください。</p>'}
    </section>

    ${MY_STORE ? `<section class="acc-card">
      <h3>この店舗を使っている人 <span class="muted small">${MY_STORE.members.length}人</span></h3>
      <ul class="store-members">${MY_STORE.members.map((m) => `<li><span class="avatar">${esc(((accs[m] || {}).name || '?').slice(0, 1))}</span>${esc((accs[m] || {}).name || '（削除済み）')} <span class="muted small">${(accs[m] || {}).staff ? 'スタッフ' : '担当者'}${m === u.id ? '・あなた' : ''}</span></li>`).join('')}</ul>
      <p class="muted small">スタッフは、ログイン画面の「お店・企業の方はこちら」→「スタッフ」から、店舗コードと名前だけで入れます（メールアドレスはいりません）。</p>
    </section>` : ''}

    <section class="acc-card">
      <h3>${u.staff ? 'スタッフ' : '担当者'}</h3>
      <div class="acc-row"><span class="avatar big-av">${esc((u.name || '?').slice(0, 1))}</span>
        <div><label class="acc-label" for="acc-name">名前</label><input id="acc-name" type="text" maxlength="20" value="${esc(u.name)}"></div></div>
      ${u.email ? `<p class="small"><span class="muted">メールアドレス</span>　${esc(u.email)}</p>` : '<p class="muted small">次からも、店舗コードとこの名前で入れます。</p>'}
      ${created ? `<p class="small"><span class="muted">登録日</span>　${created.getFullYear()}/${created.getMonth() + 1}/${created.getDate()}</p>` : ''}
      <button class="btn-soft" data-action="acc-save-name">名前を保存</button>
      <div class="acc-actions">
        <button class="btn-soft" data-action="logout">ログアウト</button>
        <button class="btn-soft danger" data-action="acc-delete">${state.confirmAcc === 'delete' ? 'もう一度押すと削除します' : 'アカウントを削除'}</button>
      </div>
      ${MY_STORE && MY_STORE.members.length === 1 ? '<p class="muted small">最後の1人が削除すると、店舗の登録と配信も消えます。</p>' : ''}
    </section>
  </div>`;
}

function renderAccount() {
  if (IS_STORE) { renderStoreAccount(); return; }
  const u = AUTH.user;
  const area = currentArea();
  const created = u.createdAt ? new Date(u.createdAt) : null;
  const a = state.acc;
  const areas = allAreas(a.liveDraft);
  const draftArea = areas.find((x) => x.id === a.area) || area;
  const f = (TRANSPORTS[a.transport] || TRANSPORTS.walk).factor;
  $('#account-view').innerHTML = `<div class="acc-grid">
    <section class="acc-card">
      <h3>プロフィール</h3>
      ${u.guest ? `<p>ゲストで利用中です。</p>
        <p class="muted small">アカウントを作ると、買い物の記録や家にある食材を残しておけます。今の記録はそのまま引き継がれます。</p>
        <button class="btn" data-action="guest-signup">アカウントを作る</button>` : `
        <div class="acc-row"><span class="avatar big-av">${esc((u.name || '?').slice(0, 1))}</span>
          <div><label class="acc-label" for="acc-name">ニックネーム</label><input id="acc-name" type="text" maxlength="20" value="${esc(u.name)}"></div></div>
        <p class="small"><span class="muted">メールアドレス</span>　${esc(u.email)}</p>
        ${created ? `<p class="small"><span class="muted">登録日</span>　${created.getFullYear()}/${created.getMonth() + 1}/${created.getDate()}</p>` : ''}
        <button class="btn-soft" data-action="acc-save-name">ニックネームを保存</button>`}
    </section>

    <section class="acc-card">
      <h3>場所と近くのお店</h3>
      <label class="acc-label" for="acc-area">よく買い物するエリア</label>
      <div class="acc-inline">
        <select id="acc-area" data-acc="area">${areas.map((x) => `<option value="${x.id}" ${x.id === a.area ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button class="link small" data-action="acc-locate">${SETTINGS.liveArea ? '現在地でお店を探しなおす' : '現在地から近くのお店を探す'}</button>
      </div>
      ${a.locMsg ? `<p class="small muted">${esc(a.locMsg)}</p>` : ''}
      <p class="acc-label">ふだんの移動手段</p>
      <div class="acc-radios">${Object.entries(TRANSPORTS).map(([k, t]) => `<label><input type="radio" name="acc-tr" data-acc="transport" value="${k}" ${a.transport === k ? 'checked' : ''}>${t.label}</label>`).join('')}</div>
      <ul class="acc-stores">${draftArea.stores.map((st, i) => `<li style="--store:${STORES[i].color}"><span class="dot"></span><span>${esc(st.name)}<span class="muted small">${esc(st.type)}</span></span><span class="num small">${(TRANSPORTS[a.transport] || TRANSPORTS.walk).label}で${Math.max(1, Math.round(st.walk * f))}分</span></li>`).join('')}</ul>
      ${draftArea.live ? `<p class="muted small">${OSM_CREDIT}。価格は実際のお店の価格ではなくサンプルです。</p>` : ''}
      ${a.area !== SETTINGS.area || a.liveDraft ? '<p class="small warn">お店を変えると、価格メモは新しいお店の価格（サンプル）に置きかわります。</p>' : ''}
      <button class="btn" data-action="acc-save-place" ${a.area === SETTINGS.area && a.transport === SETTINGS.transport && !a.liveDraft ? 'disabled' : ''}>この場所で使う</button>
    </section>

    <section class="acc-card">
      <h3>買い物の設定</h3>
      <label class="acc-label" for="acc-wage">寄り道の基準</label>
      <p class="acc-inline">1時間あたり <input id="acc-wage" type="number" min="0" step="50" value="${state.wage}"> 円以上おトクになるなら、2軒回る</p>
      <p class="muted small">例：12分よけいにかかって ¥200 安くなる → 1時間あたり ¥1,000。この金額より大きいときだけ寄り道をおすすめします。</p>
      <p class="acc-label">わけあう相手の範囲</p>
      <div class="acc-radios">${Object.entries(SHARE_SCOPES).map(([k, t]) => `<label><input type="radio" name="acc-share" data-acc-set="shareScope" value="${k}" ${SETTINGS.shareScope === k ? 'checked' : ''}>${t}</label>`).join('')}</div>
      ${SETTINGS.shareScope !== 'off' ? `<div class="share-profile">
        <label class="acc-label" for="acc-campus">大学・キャンパス${SETTINGS.shareScope === 'univ' ? '（必須）' : '（任意）'}</label>
        <input id="acc-campus" type="text" maxlength="40" data-acc-text="shareCampus" value="${esc(SETTINGS.shareCampus || '')}" placeholder="例：〇〇大学 △△キャンパス">
        <label class="acc-label" for="acc-dorm">住んでいる寮${SETTINGS.shareScope === 'dorm' ? '（必須）' : '（任意）'}</label>
        <input id="acc-dorm" type="text" maxlength="40" data-acc-text="shareDorm" value="${esc(SETTINGS.shareDorm || '')}" placeholder="例：〇〇寮">
        <label class="acc-label" for="acc-place">受け渡しの希望場所（任意）</label>
        <input id="acc-place" type="text" maxlength="40" data-acc-text="sharePlace" value="${esc(SETTINGS.sharePlace || '')}" placeholder="例：学内の生協前、寮のロビー">
        <p class="muted small">${SETTINGS.shareScope === 'dorm' ? '同じ寮' : '同じ大学・キャンパス'}を登録した人どうしでマッチングします。ほかの人に見えるのは、この名前と受け渡し場所だけです。</p>
        ${SETTINGS.shareScope === 'dorm' && !(SETTINGS.shareDorm || '').trim() ? '<p class="small warn">「同じ寮」でわけあうには、寮を登録してください。</p>' : ''}
        ${SETTINGS.shareScope === 'univ' && !(SETTINGS.shareCampus || '').trim() ? '<p class="small warn">「同じ大学（キャンパス）」でわけあうには、大学・キャンパスを登録してください。</p>' : ''}
      </div>` : ''}
      <label class="acc-switch"><input type="checkbox" data-acc-set="offersOn" ${SETTINGS.offersOn ? 'checked' : ''}> お店からのおすすめ（値引き・取り置き）を受け取る</label>
    </section>

    <section class="acc-card">
      <h3>使い方</h3>
      <p class="muted small">はじめに表示された使い方の説明を、もう一度見られます。</p>
      <button class="btn-soft" data-action="open-tutorial">使い方（チュートリアル）を見る</button>
    </section>

    <section class="acc-card">
      <h3>データ</h3>
      <p class="small">買い物の記録 <b>${state.history.length}</b>件・家にある食材 <b>${Object.keys(state.pantry).length}</b>品・じぶんの献立 <b>${customRecipes.length}</b>品</p>
      <p class="muted small">デモ版のため、記録はこの端末のブラウザの中だけに保存されています。</p>
      <div class="acc-actions">
        <button class="btn-soft" data-action="acc-clear-history">${state.confirmAcc === 'history' ? 'もう一度押すと消えます' : '買い物の記録を消す'}</button>
        <button class="btn-soft" data-action="logout">ログアウト</button>
        ${u.guest ? '' : `<button class="btn-soft danger" data-action="acc-delete">${state.confirmAcc === 'delete' ? 'もう一度押すと削除します' : 'アカウントを削除'}</button>`}
      </div>
    </section>
  </div>`;
}

function renderUserChip() {
  const u = AUTH.user;
  if (!u) return;
  $('#acc-tab').innerHTML = `<span class="avatar">${esc((u.name || '?').slice(0, 1))}</span><span class="bn-label">${u.guest ? 'ゲスト' : 'アカウント'}</span>`;
  if (IS_STORE) { $('#area-chip').innerHTML = `<span class="area-chip">店舗アカウント${MY_STORE ? '・' + esc(MY_STORE.name) : ''}</span>`; return; }
  $('#area-chip').innerHTML = `<button class="area-chip" data-action="go-tab" data-k="account" title="場所を変える"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 14.5c-.3 0-4.6-4.6-4.6-8a4.6 4.6 0 0 1 9.2 0c0 3.4-4.3 8-4.6 8z"/><circle cx="8" cy="6.4" r="1.6"/></svg>${esc(currentArea().name)}・${(TRANSPORTS[SETTINGS.transport] || TRANSPORTS.walk).label}</button>`;
}

function logout() {
  AUTH.set('kd-session', null);
  location.reload();
}

// ---------- 全体 ----------

function render() {
  if (!ALLOWED_TABS.includes(state.tab)) state.tab = ALLOWED_TABS[0];
  document.querySelectorAll('.bnav .tab').forEach((t) => { t.hidden = !ALLOWED_TABS.includes(t.dataset.tab); });
  document.body.classList.toggle('is-store', IS_STORE);
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-on', t.dataset.tab === state.tab));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${state.tab}`; });
  if (state.tab !== 'shop') $('#mbar').hidden = true;
  if (state.tab === 'shop') renderMbar();
  if (state.tab === 'shop') { if (typeof renderLiveRow === 'function') renderLiveRow(); renderOffers(); renderRecipes(); renderPicked(); renderPlan(); }
  if (state.tab === 'store') renderStore();
  if (state.tab === 'prices') renderPrices();
  if (state.tab === 'history') renderHistory();
  if (state.tab === 'account') renderAccount();
  renderUserChip();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action], .tab');
  if (!t) return;
  if (t.classList.contains('tab') || t.dataset.action === 'go-tab') {
    state.tab = t.dataset.tab || t.dataset.k;
    if (state.tab === 'account') { state.acc = { area: SETTINGS.area, transport: SETTINGS.transport, locMsg: '', liveDraft: null }; state.confirmAcc = null; }
    render(); window.scrollTo({ top: 0 }); return;
  }
  const a = t.dataset.action, id = t.dataset.id;
  const f = state.form;
  if (a === 'form-open') { f.open = true; renderForm(); $('#add-form input[data-f=name]').focus(); return; }
  if (a === 'form-close') { state.form = emptyForm(); renderForm(); return; }
  if (a === 'row-add') { f.rows.push({ id: '', qty: '' }); renderForm(); return; }
  if (a === 'row-del') { f.rows.splice(Number(t.dataset.i), 1); if (!f.rows.length) f.rows.push({ id: '', qty: '' }); renderForm(); return; }
  if (a === 'ai-fill') { aiFill(); return; }
  if (a === 'form-save') { saveForm(); return; }
  if (a === 'del-recipe') deleteRecipe(id);
  if (a === 'logout') { logout(); return; }
  if (a === 'open-tutorial') { TUTORIAL.open(); return; }
  if (a === 'guest-signup') { AUTH.set('kd-auth-from-guest', true); AUTH.set('kd-auth-mode', 'signup'); logout(); return; }
  if (a === 'acc-save-name') {
    const name = $('#acc-name').value.replace(/[<>&"'`]/g, '').trim().slice(0, 20);
    if (!name) return;
    const accs = AUTH.accounts(); accs[AUTH.user.id].name = name; AUTH.set('kd-accounts', accs); AUTH.user.name = name;
  }
  if (a === 'acc-locate') {
    state.acc.locMsg = '現在地と近くのお店を探しています…'; renderAccount();
    locateHere((area, m) => { if (area) { state.acc.liveDraft = area; state.acc.area = 'here'; state.acc.locMsg = '近くのお店が見つかりました。「この場所で使う」で切りかわります。'; } else state.acc.locMsg = m; renderAccount(); });
    return;
  }
  if (a === 'acc-save-place') {
    const areaChanged = state.acc.area !== SETTINGS.area || (state.acc.area === 'here' && !!state.acc.liveDraft);
    if (state.acc.area === 'here' && state.acc.liveDraft) SETTINGS.liveArea = state.acc.liveDraft;
    SETTINGS.area = state.acc.area; SETTINGS.transport = state.acc.transport;
    state.acc.liveDraft = null;
    applyArea();
    if (areaChanged) { state.prices = defaultPrices(); state.priceDates = {}; state.offers = SHARED_OFFERS.get(SETTINGS.area); state.bought = {}; }
    state.acc.locMsg = areaChanged ? `${currentArea().name}のお店に切りかえました。` : '移動手段を変更しました。';
  }
  if (a === 'acc-clear-history') {
    if (state.confirmAcc === 'history') { state.history = []; state.confirmAcc = null; } else { state.confirmAcc = 'history'; renderAccount(); return; }
  }
  if (a === 'store-welcome-close') { LS.set('kd-store-welcome', false); renderStore(); return; }
  if (a === 'store-copy-code' && MY_STORE && !AUTH.user.staff) {
    const done = () => { state.copied = true; renderAccount(); setTimeout(() => { state.copied = false; if (state.tab === 'account') renderAccount(); }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(MY_STORE.code).then(done, done); else done();
    return;
  }
  if (a === 'store-new-code' && MY_STORE && !AUTH.user.staff) {
    if (state.confirmAcc !== 'code') { state.confirmAcc = 'code'; renderAccount(); return; }
    const reg = STORE_REG.all();
    if (reg[AUTH.user.storeKey]) { MY_STORE.code = reg[AUTH.user.storeKey].code = newStoreCode(); STORE_REG.save(reg); }
    state.confirmAcc = null; renderAccount(); return;
  }
  if (a === 'acc-delete') {
    if (state.confirmAcc !== 'delete') { state.confirmAcc = 'delete'; renderAccount(); return; }
    const accs = AUTH.accounts(); delete accs[AUTH.user.id]; AUTH.set('kd-accounts', accs);
    if (IS_STORE) {
      // 店舗のメンバーから外す。最後の1人なら、店舗の登録と配信も消す
      const reg = STORE_REG.all(), key = AUTH.user.storeKey, s = reg[key];
      if (s) {
        s.members = s.members.filter((m) => m !== AUTH.user.id);
        if (!s.members.length) { delete reg[key]; SHARED_OFFERS.set(s.area, SHARED_OFFERS.get(s.area).filter((o) => o.store !== s.slot)); }
        STORE_REG.save(reg);
      }
    }
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.filter((k) => k.startsWith(KD_PREFIX)).forEach((k) => localStorage.removeItem(k));
    logout(); return;
  }
  if (a === 'step') { goStep(Number(t.dataset.k)); return; }
  if (a === 'ptab') { goStep({ plan: 2, list: 3, rest: 2, home: 4 }[t.dataset.k] || 1); return; }
  if (a === 'fav') {
    if (state.favs[id]) delete state.favs[id]; else state.favs[id] = true;
    save(); renderRecipes(); return;
  }
  if (a === 'reuse-menu') {
    const m = state.menuLog[Number(t.dataset.i)];
    if (m) { state.counts = {}; for (const [rid, c] of Object.entries(m.counts)) if (RECIPES.find((r) => r.id === rid)) state.counts[rid] = c; state.tagFilter = 'picked'; state.justRecorded = null; }
  }
  if (a === 'tag-filter') { state.tagFilter = t.dataset.k; renderRecipes(); return; }
  if (a === 'tick') {
    if (state.bought[id]) delete state.bought[id];
    else { const it = state.lastPlan.items.find((x) => x.id === id); state.bought[id] = { store: t.dataset.store, price: costAt(it, t.dataset.store), packs: it.packs }; }
    state.justRecorded = null;
  }
  if (a === 'tick-all') {
    const lp = state.lastPlan;
    lp.items.forEach((it) => { if (!state.bought[it.id]) { const sid = lp.plan.assign[it.id]; state.bought[it.id] = { store: sid, price: costAt(it, sid), packs: it.packs }; } });
    state.justRecorded = null;
  }
  if (a === 'edit-bought') state.editing = state.editing === id ? null : id;
  if (a === 'save-bought' || a === 'skip-bought') {
    const row = t.closest('.buy-row');
    const val = (k) => row.querySelector(`[data-be=${k}]`).value;
    if (a === 'skip-bought') state.bought[id] = { skipped: true, store: val('store'), price: 0, packs: 0 };
    else state.bought[id] = { store: val('store'), packs: Math.max(1, Math.round(Number(val('packs')) || 1)), price: Math.max(0, Math.round(Number(val('price')) || 0)) };
    state.editing = null; state.justRecorded = null;
  }
  if (a === 'add-extra') {
    const price = Math.round(Number($('#ex-price').value));
    const sel = $('#ex-id').value;
    const name = ($('#ex-name').value || '').replace(/[<>&"'`]/g, '').trim().slice(0, 30);
    if (sel === '__other' && !name) { $('#ex-name').focus(); return; }
    if (!(price > 0)) { $('#ex-price').focus(); return; }
    state.extras.push({ id: sel === '__other' ? null : sel, name: sel === '__other' ? name : '', store: $('#ex-store').value, packs: Math.max(1, Math.round(Number($('#ex-packs').value) || 1)), price });
    state.extraOpen = false; state.justRecorded = null;
  }
  if (a === 'del-extra') state.extras.splice(Number(t.dataset.i), 1);
  if (a === 'record') recordPurchase();
  if (a === 'close-banner') state.justRecorded = null;
  if (a === 'pantry-del') { delete state.pantry[id]; delete state.pantryDates[id]; }
  if (a === 'pantry-add') {
    const pid = $('#pt-id').value, q = Number($('#pt-qty').value);
    if (!(q > 0)) { $('#pt-qty').focus(); return; }
    state.pantry[pid] = (state.pantry[pid] || 0) + q;
    state.pantryDates[pid] = new Date().toISOString();
    state.pantryOpen = false;
  }
  if (a === 'go-history') { state.tab = 'history'; save(); render(); window.scrollTo({ top: 0 }); return; }
  if (a === 'del-history') {
    const i = Number(t.dataset.i);
    if (state.confirmDel === i) { state.history.splice(i, 1); state.confirmDel = null; } else state.confirmDel = i;
  }
  if (a === 'toggle-share') { if (state.shares[id]) delete state.shares[id]; else state.shares[id] = true; }
  if (a === 'reserve') {
    state.reserveMsg = '';
    mutateOffers((list) => {
      const o = list.find((x) => x.id === id);
      if (!o || !offerLive(o)) { state.reserveMsg = 'この配信は終了しました。'; return; }
      o.reservations = o.reservations || [];
      const mine = o.reservations.findIndex((r) => r.uid === AUTH.user.id);
      if (mine >= 0) { o.reservations.splice(mine, 1); return; }
      const h = Number(t.dataset.h), sl = o.slots.find((x) => x.h === h);
      if (!sl || offerTaken(o, h) >= sl.limit) { state.reserveMsg = 'ちょうど埋まってしまいました。ほかの時間帯を見てください。'; return; }
      o.reservations.push({ uid: AUTH.user.id, h, at: new Date().toISOString(), code: newPickupCode(o), day: pickupDay(h) });
    });
  }
  if (a === 'receipt-sample') { state.receipt.store = 'B'; state.receipt.text = SAMPLE_RECEIPT; state.receipt.result = null; }
  if (a === 'receipt-read') applyReceipt();
  if (a === 'inc') state.justRecorded = null;
  if (a === 'inc') state.counts[id] = (state.counts[id] || 0) + 1;
  if (a === 'dec') { state.counts[id] = Math.max(0, (state.counts[id] || 0) - 1); if (!state.counts[id]) delete state.counts[id]; }
  if (a === 'clear') state.counts = {};
  if (a === 'sample') state.counts = { ...SAMPLE_MENU };
  if ((a && a.startsWith('offer-')) || a === 'dr-discount') {
    if (!IS_STORE || !MY_STORE) return;
    const sid = MY_STORE.slot;
    state.draftMsg = '';
    if (a === 'offer-draft') { const r = storeDemand(sid).find((x) => x.id === t.dataset.ing); if (r) state.draft = newDraft(r, sid); }
    if (a === 'offer-cancel') state.draft = null;
    if (a === 'dr-discount' && state.draft) state.draft.discount = Number(t.dataset.v);
    if (a === 'offer-pickup') {
      const inp = $('#pc-' + id), code = (inp ? inp.value : '').replace(/\D/g, '');
      const result = mutateOffers((list) => {
        const o = list.find((x) => x.id === id);
        if (!o) return { ok: false, text: '配信が見つかりません。' };
        if (code.length !== 4) return { ok: false, text: '4桁の数字を入れてください。' };
        const r = (o.reservations || []).find((x) => x.code === code);
        if (!r) return { ok: false, text: `${code} の取り置きはありません。` };
        if (r.picked) return { ok: false, text: `${code} はもう受け取り済みです。` };
        if (r.day && r.day !== dayStr()) return { ok: false, text: `${code} は ${fmtDay(r.day)} に使うコードです。` };
        r.picked = true; r.pickedAt = new Date().toISOString();
        return { ok: true, text: `OK：${code}（${r.h}時台の取り置き）を受け取り済みにしました。${INGREDIENTS[o.ing].name}を渡してください。` };
      });
      state.pickupMsg = Object.assign({ id }, result);
      renderStore(); return;
    }
    if (a === 'offer-stop') {
      if (state.confirmStop !== id) { state.confirmStop = id; renderStore(); return; }
      state.confirmStop = null;
      mutateOffers((list) => { const o = list.find((x) => x.id === id); if (o) { o.status = 'ended'; o.endedAt = new Date().toISOString(); } });
    }
    if (a === 'offer-send' && state.draft) {
      const d = state.draft, msgEl = $('#dr-msg');
      if (msgEl) d.msg = msgEl.value;
      const slots = OFFER_HOURS.filter((h) => d.slots[h].on).map((h) => ({ h, limit: Math.max(1, Math.round(Number(d.slots[h].limit) || 1)) }));
      if (!slots.length) { state.draftMsg = '取り置きの時間帯を1つ以上えらんでください。'; renderStore(); return; }
      const ing = d.ing;
      mutateOffers((list) => {
        list.forEach((o) => { if (o.store === sid && o.ing === ing && offerLive(o)) { o.status = 'ended'; o.endedAt = new Date().toISOString(); } });
        list.push({
          id: 'o' + Date.now().toString(36), store: sid, ing, discount: d.discount,
          recipes: Object.keys(d.recipes).filter((k) => d.recipes[k]), slots, qty: slots.reduce((x, y) => x + y.limit, 0),
          message: d.msg.replace(/[<>]/g, '').trim().slice(0, 60), until: untilDate(d.until), at: new Date().toISOString(),
          status: 'live', by: AUTH.user.name, excess: Number(t.dataset.excess) || 0, basePrice: basePrice(ing, sid), reservations: [],
        });
      });
      state.draft = null;
    }
    renderStore(); return;
  }
  if (a === 'reset-prices') state.prices = defaultPrices();
  save();
  render();
});

// フォームの入力（再描画せずに値だけ覚える）
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.closest || !el.closest('#add-form')) return;
  const f = state.form;
  if (el.dataset.f === 'name') f.name = el.value;
  if (el.dataset.f === 'tag') f.tag = el.value;
  if (el.dataset.row !== undefined) f.rows[Number(el.dataset.row)][el.dataset.k] = el.value;
  if (el.dataset.ai) { state.ai[el.dataset.ai] = el.value.trim(); save(); }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.dr === 'msg' && state.draft) state.draft.msg = el.value;
  if (el.dataset && el.dataset.rc) state.receipt[el.dataset.rc] = el.value;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f === 'name' && !e.isComposing) { e.preventDefault(); aiFill(); }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.dr && state.draft) {
    const d = state.draft, h = el.dataset.h;
    if (el.dataset.dr === 'slot-on') d.slots[h].on = el.checked;
    if (el.dataset.dr === 'slot-limit') d.slots[h].limit = Math.max(1, Math.min(99, Math.round(Number(el.value) || 1)));
    if (el.dataset.dr === 'until') d.until = el.value;
    if (el.dataset.dr === 'recipe') d.recipes[el.dataset.id] = el.checked;
    if (el.dataset.dr === 'msg') d.msg = el.value;
    renderStore(); return;
  }
  if (el.dataset && el.dataset.acc) { state.acc[el.dataset.acc] = el.value; state.acc.locMsg = ''; renderAccount(); return; }
  if (el.dataset && el.dataset.accSet) {
    SETTINGS[el.dataset.accSet] = el.type === 'checkbox' ? el.checked : el.value;
    save();
    if (el.dataset.accSet === 'shareScope') renderAccount();
    return;
  }
  if (el.dataset && el.dataset.accText) {
    SETTINGS[el.dataset.accText] = el.value.replace(/[<>&"'`]/g, '').trim().slice(0, 40);
    save(); renderAccount(); return;
  }
  if (el.id === 'rc-camera' || el.id === 'rc-photo') {
    const file = el.files && el.files[0];
    if (file) startReceiptOcr(file);
    el.value = '';
    return;
  }
  if (el.id === 'ex-id') { $('#ex-name-wrap').hidden = el.value !== '__other'; if (el.value === '__other') $('#ex-name').focus(); return; }
  if (el.id === 'acc-wage') { state.wage = Math.max(0, Number(el.value) || 0); save(); return; }
  if (el.closest && el.closest('#add-form')) { if (el.dataset.k === 'id' || el.dataset.f === 'tag') renderForm(); return; }
  if (el.id === 'wage') { state.wage = Math.max(0, Number(el.value) || 0); state.optOpen = true; save(); renderPlan(); }
  if (el.dataset && el.dataset.ing && el.dataset.store) {
    state.prices[el.dataset.ing][el.dataset.store] = el.value === '' ? null : Number(el.value);
    save(); renderPrices();
  }
});

// 期限が来た配信を画面から外す（1分ごとに確認）
let liveCount = state.offers.filter(offerLive).length;
setInterval(() => {
  const n = state.offers.filter(offerLive).length;
  if (n !== liveCount) { liveCount = n; if (state.tab === 'shop' || state.tab === 'store') render(); }
}, 60000);

// ほかのタブ・アカウントでお店が配信したら、すぐに反映する
window.addEventListener('storage', (e) => {
  if (e.key !== 'kd-shared-offers' || !AUTH.user) return;
  state.offers = SHARED_OFFERS.get(SETTINGS.area);
  if (state.tab === 'shop' || state.tab === 'store') render();
});

if (AUTH.user) { renderForm(); render(); }

document.addEventListener('toggle', (e) => {
  if (e.target.id === 'extra-details') state.extraOpen = e.target.open;
  if (e.target.id === 'pantry-details') state.pantryOpen = e.target.open;
  if (e.target.id === 'opt-details') state.optOpen = e.target.open;
  if (e.target.id === 'lo-more') state.loMore = e.target.open;
  if (e.target.id === 'offer-details') state.offerOpen = e.target.open;
}, true);
