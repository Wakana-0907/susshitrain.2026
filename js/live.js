// ライブ配信（デモ）
// お店がカメラでライブ配信し、利用者がコメント・ハート・取り置きをする。
// サーバーがないため、映像は同じブラウザの別タブどうしで WebRTC（BroadcastChannel で接続情報を交換）で流す。
// 配信中かどうか・視聴者数・コメント・ハートは localStorage で共有する。

const LIVES = {
  all: () => AUTH.get('kd-lives', {}),
  save: (o) => AUTH.set('kd-lives', o),
};
const LIVE_STALE = 15000; // お店の画面から15秒合図がなければ終了あつかい
const liveOn = (l) => !!(l && Date.now() - (l.beat || 0) < LIVE_STALE);
const liveKey = (area, slot) => `${area}:${slot}`;
function liveFor(area, slot) { const l = LIVES.all()[liveKey(area, slot)]; return liveOn(l) ? l : null; }
function updLive(key, fn) { const all = LIVES.all(); if (!all[key]) return; fn(all[key]); LIVES.save(all); }
const liveViewers = (l) => Object.values((l && l.viewers) || {}).filter((t) => Date.now() - t < LIVE_STALE).length;
const chatKey = (id) => `kd-live-chat:${id}`;
const getChat = (id) => AUTH.get(chatKey(id), []);
function addChat(id, item) {
  const list = getChat(id);
  list.push(item);
  AUTH.set(chatKey(id), list.slice(-80));
}
const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const HEART_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="currentColor"/></svg>';

const LIVE = (() => {
  const box = document.getElementById('live');
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('kd-live') : null;
  const tabId = Math.random().toString(36).slice(2, 10);
  let mode = null; // 'setup' | 'host' | 'view'
  let key = null, liveId = null, stream = null, facing = 'environment', timer = null, lastHearts = 0, lastChat = 0;
  const peers = {}; // 配信側：視聴者ごとの接続
  let vpc = null, vQueue = [], vRemote = false, gotVideo = false; // 視聴側
  const post = (m) => { if (ch) ch.postMessage(m); };
  const $l = (s) => box.querySelector(s);

  // ---------- 映像（WebRTC） ----------
  async function hostOffer(vid) {
    if (!stream) return;
    if (peers[vid]) { try { peers[vid].close(); } catch (e) { /* */ } }
    const pc = new RTCPeerConnection({ iceServers: [] });
    peers[vid] = pc;
    stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
    pc.onicecandidate = (e) => { if (e.candidate) post({ t: 'ice', key, to: vid, c: e.candidate.toJSON() }); };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    post({ t: 'offer', key, to: vid, sdp: pc.localDescription.toJSON() });
  }
  function viewerJoin() { if (mode === 'view' && !gotVideo) post({ t: 'join', key, vid: tabId }); }
  async function viewerOffer(sdp) {
    if (vpc) { try { vpc.close(); } catch (e) { /* */ } }
    vRemote = false; vQueue = [];
    const pc = new RTCPeerConnection({ iceServers: [] });
    vpc = pc;
    pc.ontrack = (e) => {
      const v = $l('#lv-video');
      if (v && v.srcObject !== e.streams[0]) { v.srcObject = e.streams[0]; v.play().catch(() => {}); }
      gotVideo = true;
      box.classList.add('has-video');
    };
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { gotVideo = false; box.classList.remove('has-video'); } };
    pc.onicecandidate = (e) => { if (e.candidate) post({ t: 'ice', key, to: 'host', from: tabId, c: e.candidate.toJSON() }); };
    await pc.setRemoteDescription(sdp);
    vRemote = true;
    vQueue.forEach((c) => pc.addIceCandidate(c).catch(() => {})); vQueue = [];
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    post({ t: 'answer', key, from: tabId, sdp: pc.localDescription.toJSON() });
  }
  if (ch) ch.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.key !== key) return;
    if (mode === 'host') {
      if (m.t === 'join') hostOffer(m.vid).catch(() => {});
      if (m.t === 'answer' && peers[m.from]) peers[m.from].setRemoteDescription(m.sdp).catch(() => {});
      if (m.t === 'ice' && m.to === 'host' && peers[m.from]) peers[m.from].addIceCandidate(m.c).catch(() => {});
      if (m.t === 'leave' && peers[m.vid]) { try { peers[m.vid].close(); } catch (e) { /* */ } delete peers[m.vid]; }
    }
    if (mode === 'view') {
      if (m.t === 'host-up') { gotVideo = false; viewerJoin(); }
      if (m.t === 'offer' && m.to === tabId) viewerOffer(m.sdp).catch(() => {});
      if (m.t === 'ice' && m.to === tabId && vpc) { if (vRemote) vpc.addIceCandidate(m.c).catch(() => {}); else vQueue.push(m.c); }
      if (m.t === 'host-end') refresh();
    }
  };

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true });
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    const v = $l('#lv-video');
    if (v) { v.srcObject = stream; v.muted = true; v.play().catch(() => {}); }
    box.classList.add('has-video');
    // 配信中にカメラを切りかえたら、視聴者につなぎなおす
    if (mode === 'host') Object.keys(peers).forEach((vid) => hostOffer(vid).catch(() => {}));
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
    box.classList.remove('has-video');
  }

  // ---------- 画面 ----------
  function shell(inner) {
    box.innerHTML = `<div class="lv-stage">
      <video id="lv-video" autoplay playsinline muted></video>
      <div class="lv-novideo"><span>${mode === 'view' ? '映像を待っています…<br><small>映像は、お店と同じブラウザの別タブで見られます（デモ）</small>' : 'カメラの映像がここに出ます'}</span></div>
      <div class="lv-shade"></div>
      ${inner}
      <div class="lv-hearts" id="lv-hearts"></div>
    </div>`;
    box.hidden = false;
    document.body.classList.add('lv-open');
  }

  function pinnedOffers(area, slot) {
    return SHARED_OFFERS.get(area).filter((o) => o.store === slot && offerLive(o));
  }

  function pinHtml(l, asHost) {
    const list = pinnedOffers(l.area, l.slot);
    const o = list.find((x) => x.id === l.pin) || list[0];
    if (!o) return asHost ? '<div class="lv-pin muted small">配信中の値引きはありません（「配信内容を決める」から出せます）</div>' : '';
    const ing = INGREDIENTS[o.ing];
    const bp = asHost ? (o.basePrice || basePrice(o.ing, o.store)) : basePrice(o.ing, o.store);
    return `<div class="lv-pin">
      <p><b>${esc(ing ? ing.name : o.ing)}</b> <span class="off">${Math.round(o.discount * 100)}%オフ</span> <span class="small">${yen(bp)} → <b>${yen(Math.round(bp * (1 - o.discount)))}</b></span></p>
      ${asHost ? `<p class="small">取り置き <b>${offerTaken(o)}</b> / ${o.qty}個　<span class="muted">${fmtUntil(o.until)}</span></p>` : offerSlotHtml(o)}
    </div>`;
  }

  function chatHtml(id) {
    return getChat(id).slice(-7).map((c) => `<li class="${c.host ? 'is-host' : ''}"><b>${esc(c.name)}</b>${esc(c.text)}</li>`).join('');
  }

  function drawSetup() {
    const offers = pinnedOffers(MY_STORE.area, MY_STORE.slot);
    shell(`<div class="lv-top"><span class="lv-store">${esc(MY_STORE.name)}</span><button class="lv-x" data-lv="close" aria-label="閉じる">×</button></div>
      <div class="lv-setup">
        <h3>ライブ配信をはじめる</h3>
        <label class="acc-label" for="lv-title">タイトル</label>
        <input id="lv-title" type="text" maxlength="30" value="${esc(state.liveTitle || '今日のおすすめを紹介します')}">
        <label class="acc-label" for="lv-pin-sel">画面に出す値引き</label>
        <select id="lv-pin-sel">${offers.length ? offers.map((o) => `<option value="${o.id}">${esc(INGREDIENTS[o.ing].name)} ${Math.round(o.discount * 100)}%オフ</option>`).join('') : '<option value="">（配信中の値引きはありません）</option>'}</select>
        <p class="small lv-cam-msg" id="lv-cam-msg"></p>
        <div class="acc-actions">
          <button class="btn" data-lv="go">ライブを開始</button>
          <button class="btn-soft" data-lv="flip">カメラを切りかえ</button>
        </div>
        <p class="muted small">映像は、同じブラウザの別のタブで利用者としてログインすると見られます（デモ）。本番では配信サーバーを使います。</p>
      </div>`);
    startCamera().catch(() => { const m = $l('#lv-cam-msg'); if (m) m.textContent = 'カメラが使えません。映像なしでもライブ（コメント・ハート・取り置き）はできます。'; });
  }

  function drawLive() {
    const all = LIVES.all(); const l = all[key];
    if (!l) { close(); return; }
    const host = mode === 'host';
    shell(`<div class="lv-top">
        <span class="lv-badge">LIVE</span>
        <span class="lv-store">${esc(l.storeName)}</span>
        <span class="lv-meta" id="lv-meta"></span>
        <button class="lv-x" data-lv="close" aria-label="${host ? '最小化' : '閉じる'}">×</button>
      </div>
      <p class="lv-title">${esc(l.title)}</p>
      <div class="lv-bottom">
        <ul class="lv-chat" id="lv-chat">${chatHtml(l.id)}</ul>
        <div id="lv-pin">${pinHtml(l, host)}</div>
        <form class="lv-form" id="lv-form">
          <input id="lv-text" type="text" maxlength="40" placeholder="${host ? 'お店からコメント' : 'コメントする'}" autocomplete="off">
          <button type="submit" class="lv-send">送信</button>
          ${host ? '' : `<button type="button" class="lv-heart" data-lv="heart" aria-label="ハート">${HEART_SVG}</button>`}
        </form>
        ${host ? `<div class="lv-host-actions"><button class="btn-soft" data-lv="flip">カメラを切りかえ</button><button class="btn lv-end" data-lv="end">${state.confirmEnd ? 'もう一度押すと終了' : 'ライブを終了'}</button></div>` : '<button class="lv-sound" data-lv="sound">音を出す</button>'}
      </div>`);
    if (host && stream) { const v = $l('#lv-video'); v.srcObject = stream; v.play().catch(() => {}); box.classList.add('has-video'); }
    lastHearts = l.hearts || 0;
    lastChat = getChat(l.id).length;
    meta();
  }

  function meta() {
    const l = LIVES.all()[key];
    const m = $l('#lv-meta');
    if (!l || !m) return;
    m.innerHTML = `<span>${liveViewers(l)}人が視聴中</span><span class="lv-hcount">${HEART_SVG}${l.hearts || 0}</span>${mode === 'host' ? `<span>${fmtClock(Date.now() - new Date(l.startedAt).getTime())}</span>` : ''}`;
  }

  function floatHearts(n) {
    const wrap = $l('#lv-hearts');
    if (!wrap) return;
    for (let i = 0; i < Math.min(n, 8); i++) {
      const h = document.createElement('span');
      h.className = 'lv-fh';
      h.innerHTML = HEART_SVG;
      h.style.left = `${10 + Math.random() * 40}px`;
      h.style.animationDelay = `${i * 0.12}s`;
      h.style.color = ['#ff6b8a', '#f2b84b', '#4a90b8', '#ff8fa3'][Math.floor(Math.random() * 4)];
      wrap.appendChild(h);
      setTimeout(() => h.remove(), 2600);
    }
  }

  // ほかのタブで変わったところだけを書きかえる（映像はそのまま）
  function refresh() {
    if (!mode || mode === 'setup') return;
    const l = LIVES.all()[key];
    if (!liveOn(l)) {
      if (mode === 'view') {
        box.querySelector('.lv-stage').innerHTML += '<div class="lv-ended"><p>ライブは終了しました</p><button class="btn" data-lv="close">閉じる</button></div>';
        mode = 'ended';
      }
      return;
    }
    const chat = getChat(l.id);
    if (chat.length !== lastChat) { lastChat = chat.length; const c = $l('#lv-chat'); if (c) c.innerHTML = chatHtml(l.id); }
    if ((l.hearts || 0) > lastHearts) { floatHearts(l.hearts - lastHearts); lastHearts = l.hearts; }
    const p = $l('#lv-pin'); if (p) p.innerHTML = pinHtml(l, mode === 'host');
    meta();
  }

  function tick() {
    if (mode === 'host') updLive(key, (l) => { l.beat = Date.now(); l.peak = Math.max(l.peak || 0, liveViewers(l)); });
    if (mode === 'view') {
      updLive(key, (l) => { l.viewers = l.viewers || {}; l.viewers[tabId] = Date.now(); for (const [k, t] of Object.entries(l.viewers)) if (Date.now() - t > 60000) delete l.viewers[k]; });
      viewerJoin();
    }
    refresh();
    if (mode === 'host' && box.hidden) updateLivePanel();
  }

  // ---------- 操作 ----------
  function openHost() {
    if (!IS_STORE || !MY_STORE) return;
    key = liveKey(MY_STORE.area, MY_STORE.slot);
    const cur = LIVES.all()[key];
    if (liveOn(cur) && cur.hostTab === tabId) { mode = 'host'; drawLive(); return; }
    mode = 'setup';
    drawSetup();
  }
  function go() {
    const title = ($l('#lv-title').value || '').replace(/[<>]/g, '').trim().slice(0, 30) || 'ライブ配信中';
    state.liveTitle = title;
    const pin = $l('#lv-pin-sel') ? $l('#lv-pin-sel').value : '';
    const all = LIVES.all();
    const cur = all[key];
    if (liveOn(cur) && cur.hostTab !== tabId) { const m = $l('#lv-cam-msg'); if (m) m.textContent = `${cur.hostName}さんが配信中です。`; return; }
    liveId = 'L' + Date.now().toString(36);
    all[key] = { id: liveId, area: MY_STORE.area, slot: MY_STORE.slot, storeName: MY_STORE.name, title, pin, startedAt: new Date().toISOString(), beat: Date.now(), hostTab: tabId, hostName: AUTH.user.name, viewers: {}, hearts: 0, peak: 0 };
    LIVES.save(all);
    mode = 'host';
    state.confirmEnd = false;
    drawLive();
    post({ t: 'host-up', key });
    clearInterval(timer); timer = setInterval(tick, 3000);
    updateLivePanel();
  }
  function end() {
    const all = LIVES.all(); const l = all[key];
    if (l && l.hostTab === tabId) {
      const log = AUTH.get('kd-live-log', {});
      (log[key] = log[key] || []).unshift({ id: l.id, title: l.title, startedAt: l.startedAt, endedAt: new Date().toISOString(), peak: l.peak || 0, hearts: l.hearts || 0, comments: getChat(l.id).filter((c) => !c.host).length });
      log[key] = log[key].slice(0, 20);
      AUTH.set('kd-live-log', log);
      delete all[key]; LIVES.save(all);
    }
    post({ t: 'host-end', key });
    Object.values(peers).forEach((pc) => { try { pc.close(); } catch (e) { /* */ } });
    Object.keys(peers).forEach((k) => delete peers[k]);
    stopCamera();
    clearInterval(timer); timer = null;
    mode = null;
    hide();
    updateLivePanel();
  }
  function openViewer(k) {
    key = k; mode = 'view'; gotVideo = false;
    const l = LIVES.all()[key];
    if (!liveOn(l)) return;
    drawLive();
    tick();
    clearInterval(timer); timer = setInterval(tick, 3000);
  }
  function hide() { box.hidden = true; box.innerHTML = ''; document.body.classList.remove('lv-open'); box.classList.remove('has-video'); }
  function close() {
    if (mode === 'host') { hide(); updateLivePanel(); return; } // 配信は続ける（最小化）
    if (mode === 'setup') { stopCamera(); mode = null; hide(); return; }
    if (mode === 'view' || mode === 'ended') {
      post({ t: 'leave', key, vid: tabId });
      updLive(key, (l) => { if (l.viewers) delete l.viewers[tabId]; });
      if (vpc) { try { vpc.close(); } catch (e) { /* */ } vpc = null; }
      clearInterval(timer); timer = null; mode = null;
    }
    hide();
    if (state.tab === 'shop') renderLiveRow();
  }

  box.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lv]');
    if (!t) {
      if (e.target.closest('[data-action=reserve]')) setTimeout(refresh, 0);
      return;
    }
    const a = t.dataset.lv;
    if (a === 'close') close();
    if (a === 'go') go();
    if (a === 'flip') { facing = facing === 'environment' ? 'user' : 'environment'; startCamera().catch(() => {}); }
    if (a === 'end') { if (!state.confirmEnd) { state.confirmEnd = true; t.textContent = 'もう一度押すと終了'; return; } state.confirmEnd = false; end(); }
    if (a === 'heart') { updLive(key, (l) => { l.hearts = (l.hearts || 0) + 1; }); refresh(); }
    if (a === 'sound') { const v = $l('#lv-video'); if (v) { v.muted = false; v.play().catch(() => {}); } t.remove(); }
  });
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $l('#lv-text');
    const text = (inp.value || '').replace(/[<>]/g, '').trim().slice(0, 40);
    const l = LIVES.all()[key];
    if (!text || !l) return;
    addChat(l.id, { name: mode === 'host' ? 'お店' : (AUTH.user.name || 'ゲスト'), text, host: mode === 'host', at: Date.now() });
    inp.value = '';
    refresh();
  });
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key === 'kd-lives' || e.key.startsWith('kd-live-chat:') || e.key === 'kd-shared-offers') {
      refresh();
      if (state.tab === 'shop' && e.key === 'kd-lives') renderLiveRow();
      if (state.tab === 'store' && e.key === 'kd-lives') updateLivePanel();
    }
  });
  window.addEventListener('beforeunload', () => {
    if (mode === 'host') { const all = LIVES.all(); if (all[key] && all[key].hostTab === tabId) { all[key].beat = 0; LIVES.save(all); } }
    if (mode === 'view') post({ t: 'leave', key, vid: tabId });
  });

  return { openHost, openViewer, isHosting: () => mode === 'host', tabId };
})();

// ---------- 利用者：どのお店が配信中か ----------
function renderLiveRow() {
  const box = document.getElementById('live-row');
  if (!box) return;
  if (!SETTINGS.offersOn || IS_STORE) { box.innerHTML = ''; return; }
  const items = STORES.map((s) => {
    const live = liveFor(SETTINGS.area, s.id);
    const n = state.offers.filter((o) => o.store === s.id && offerLive(o)).length;
    return { s, live, n };
  });
  const liveN = items.filter((x) => x.live).length;
  const offN = items.filter((x) => x.n).length;
  box.innerHTML = `<div class="live-row">
    <p class="lr-title">お店の配信 <span class="muted small">${liveN ? `ライブ中 ${liveN}店` : ''}${liveN && offN ? '・' : ''}${offN ? `値引き配信中 ${offN}店` : ''}${!liveN && !offN ? 'いまは配信していません' : ''}</span></p>
    <div class="lr-list">${items.map(({ s, live, n }) => `<button class="lr-item ${live ? 'is-live' : n ? 'is-off' : 'is-idle'}" ${live ? `data-action="live-watch" data-k="${s.id}"` : n ? 'data-action="open-offers"' : 'disabled'} style="--store:${s.color}">
      <span class="lr-av">${esc(s.name.slice(0, 1))}</span>
      ${live ? '<span class="lr-badge">LIVE</span>' : n ? '<span class="lr-badge off">値引き</span>' : ''}
      <span class="lr-name">${esc(s.name)}</span>
      <span class="lr-sub">${live ? `${liveViewers(live)}人が視聴中` : n ? `${n}件配信中` : '配信なし'}</span>
    </button>`).join('')}</div>
  </div>`;
}
// 配信の状態が変わったら（期限切れなど）並びを更新する
setInterval(() => { if (AUTH.user && state.tab === 'shop' && document.getElementById('live').hidden) renderLiveRow(); }, 5000);

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'live-watch') LIVE.openViewer(liveKey(SETTINGS.area, t.dataset.k));
  if (a === 'open-offers') {
    state.offerOpen = true; renderOffers();
    const el = document.getElementById('offers'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (a === 'live-host') LIVE.openHost();
});

// ---------- お店：ライブ配信のパネル ----------
function updateLivePanel() { const el = document.getElementById('live-panel'); if (el && state.tab === 'store') el.outerHTML = storeLivePanel(); }
function storeLivePanel() {
  if (!IS_STORE || !MY_STORE) return '';
  const key = liveKey(MY_STORE.area, MY_STORE.slot);
  const l = LIVES.all()[key];
  const on = liveOn(l);
  const mine = on && l.hostTab === LIVE.tabId;
  const log = (AUTH.get('kd-live-log', {})[key] || []).slice(0, 3);
  return `<section class="panel live-panel" id="live-panel">
    <div class="lp-head">
      <h3>ライブ配信 <span class="muted small">カメラで商品を見せながら、値引きと取り置きを案内</span></h3>
      ${on ? `<span class="lv-badge">LIVE</span>` : ''}
    </div>
    ${on ? `<p class="small">${mine ? '配信中です' : `${esc(l.hostName)}さんが配信中です`}：「${esc(l.title)}」・${liveViewers(l)}人が視聴中・ハート ${l.hearts || 0}</p>` : '<p class="muted small">ライブ中は、利用者の「かいもの」画面に LIVE が出ます。</p>'}
    ${on && !mine ? '' : `<button class="btn" data-action="live-host">${mine ? 'ライブ画面にもどる' : 'ライブを始める'}</button>`}
    ${log.length ? `<ul class="lp-log">${log.map((x) => { const d = new Date(x.startedAt); const min = Math.max(1, Math.round((new Date(x.endedAt) - d) / 60000)); return `<li><span>${d.getMonth() + 1}/${d.getDate()} ${esc(x.title)}</span><span class="muted small">${min}分・最大${x.peak}人・ハート${x.hearts}・コメント${x.comments}</span></li>`; }).join('')}</ul>` : ''}
  </section>`;
}

if (AUTH.user) render();
