// アカウント（デモ版）
// サーバーを使わず、このブラウザの中だけにアカウントと記録を保存します。

const AUTH = (() => {
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } };
  const accounts = () => get('kd-accounts', {});
  const sid = get('kd-session', null);
  let user = null;
  if (sid === 'guest') user = { id: 'guest', name: 'ゲスト', guest: true };
  else if (sid && accounts()[sid]) user = { id: sid, ...accounts()[sid] };
  return { get, set, accounts, user };
})();

// お店のアカウント（デモ）：店舗の登録情報と店舗コード
const STORE_REG = {
  all: () => AUTH.get('kd-stores', {}),
  save: (o) => AUTH.set('kd-stores', o),
};
function newStoreCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(6);
  try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < 6; i++) r[i] = Math.floor(Math.random() * 1e9); }
  return [...r].map((x) => chars[x % chars.length]).join('');
}
const IS_STORE = !!(AUTH.user && AUTH.user.role === 'store');
const MY_STORE = IS_STORE ? (STORE_REG.all()[AUTH.user.storeKey] || null) : null;

// ログイン中のユーザーごとに保存場所を分ける
const KD_PREFIX = AUTH.user ? `kd:${AUTH.user.id}:` : 'kd:nouser:';

async function hashPassword(email, pw) {
  const text = `${email.trim().toLowerCase()}:${pw}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'x' + h;
  }
}

// 以前の記録（ログイン機能を入れる前のもの）やゲストの記録を、新しいアカウントに引き継ぐ
function copyData(fromPrefix, toPrefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.forEach((k) => {
    if (fromPrefix === '' && (!k.startsWith('kd-') || k === 'kd-accounts' || k === 'kd-session' || k.startsWith('kd-auth'))) return;
    if (fromPrefix && !k.startsWith(fromPrefix)) return;
    const rest = fromPrefix ? k.slice(fromPrefix.length) : k;
    const dest = toPrefix + rest;
    if (localStorage.getItem(dest) === null) localStorage.setItem(dest, localStorage.getItem(k));
  });
}

(function authScreen() {
  if (AUTH.user) return;
  document.body.classList.add('locked');
  const box = document.getElementById('auth');
  const fromGuest = AUTH.get('kd-auth-from-guest', false);
  const st = { side: 'user', mode: AUTH.get('kd-auth-mode', 'login'), step: 1, name: '', email: '', pw: '', code: '', area: AREAS[0].id, slot: 'A', transport: 'bike', msg: '', locMsg: '', liveArea: null };
  const areaList = () => (st.liveArea ? [st.liveArea, ...AREAS] : AREAS);
  AUTH.set('kd-auth-mode', null);
  const e = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function drawStore() {
    const reg = STORE_REG.all();
    const m = st.mode;
    let body = '';
    if (m === 'slogin') {
      body = `
        <label class="au-field"><span>メールアドレス</span><input id="au-email" type="email" autocomplete="username" value="${e(st.email)}"></label>
        <label class="au-field"><span>パスワード</span><input id="au-pw" type="password" autocomplete="current-password"></label>
        <label class="au-field"><span>店舗コード（スタッフがいる店舗は必須）</span><input id="au-code" type="text" maxlength="6" autocomplete="off" value="${e(st.code)}" placeholder="例：K7Q4MZ" class="au-code"></label>
        <button class="btn au-main" data-auth="slogin">ログイン</button>`;
    } else if (m === 'screate') {
      const area = AREAS.find((a) => a.id === st.area) || AREAS[0];
      body = `
        <p class="au-step">はじめて登録する店舗は、そのまま作れます。登録すると「店舗コード」が発行されるので、ほかのスタッフに伝えてください。</p>
        <label class="au-field"><span>エリア</span>
          <select id="au-area">${AREAS.map((a) => `<option value="${a.id}" ${a.id === st.area ? 'selected' : ''}>${e(a.name)}</option>`).join('')}</select>
        </label>
        <label class="au-field"><span>店舗</span>
          <select id="au-slot">${area.stores.map((s2, i) => { const k = 'ABC'[i]; const used = reg[area.id + ':' + k]; return `<option value="${k}" ${k === st.slot ? 'selected' : ''} ${used ? 'disabled' : ''}>${e(s2.name)}${used ? '（登録済み）' : ''}</option>`; }).join('')}</select>
        </label>
        <label class="au-field"><span>担当者名</span><input id="au-name" type="text" maxlength="20" value="${e(st.name)}" placeholder="例：店長 太郎"></label>
        <label class="au-field"><span>メールアドレス</span><input id="au-email" type="email" autocomplete="username" value="${e(st.email)}"></label>
        <label class="au-field"><span>パスワード（6文字以上）</span><input id="au-pw" type="password" autocomplete="new-password"></label>
        <button class="btn au-main" data-auth="screate">店舗を登録する</button>`;
    } else {
      body = `
        <p class="au-step">店舗の担当者から聞いた「店舗コード」と、あなたの名前を入れてください。はじめての名前ならスタッフとして登録され、次からも同じコードと名前で入れます（メールアドレスとパスワードはいりません）。</p>
        <label class="au-field"><span>店舗コード</span><input id="au-code" type="text" maxlength="6" autocomplete="off" value="${e(st.code)}" placeholder="例：K7Q4MZ" class="au-code"></label>
        <label class="au-field"><span>名前</span><input id="au-name" type="text" maxlength="20" autocomplete="off" value="${e(st.name)}" placeholder="例：スタッフ 花子"></label>
        <button class="btn au-main" data-auth="sjoin">コードと名前で入る</button>`;
    }
    box.innerHTML = `<div class="au-card au-store">
      <div class="au-brand">
        <svg class="logo" viewBox="0 0 48 48" fill="none" stroke="#24323a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21v18h30V21" fill="#fff"/><path d="M6 21l4-11h28l4 11c0 3-2.5 4.5-5 4.5S32.5 24 32.5 21c0 3-2.5 4.5-5 4.5S23 24 23 21c0 3-2.5 4.5-5 4.5S13.5 24 13.5 21c0 3-2.5 4.5-4.5 4.5S6 24 6 21z" fill="#f6c9a6"/><path d="M20 39V29h8v10" fill="#e4f0f7"/>
        </svg>
        <div><h1>お店・企業の方</h1><p class="au-sub">需要予測と、売れ残りの配信ができる店舗専用の画面です</p></div>
      </div>
      <div class="au-tabs au-tabs3" role="tablist">
        <button role="tab" aria-selected="${m === 'slogin'}" class="${m === 'slogin' ? 'is-on' : ''}" data-auth="mode-slogin">担当者</button>
        <button role="tab" aria-selected="${m === 'screate'}" class="${m === 'screate' ? 'is-on' : ''}" data-auth="mode-screate">店舗を登録</button>
        <button role="tab" aria-selected="${m === 'sjoin'}" class="${m === 'sjoin' ? 'is-on' : ''}" data-auth="mode-sjoin">スタッフ</button>
      </div>
      <form class="au-form" novalidate>${body}</form>
      ${st.msg ? `<p class="au-msg" role="alert">${e(st.msg)}</p>` : ''}
      <div class="au-sep"><span>一般の方</span></div>
      <button class="btn-soft au-guest" data-auth="side-user">← 一般の方のログインへ</button>
      <p class="au-note small">デモ版のため、店舗のアカウントと店舗コードはこの端末のブラウザの中だけに保存されます。</p>
    </div>`;
  }

  function draw() {
    if (st.side === 'store') { drawStore(); return; }
    const login = st.mode === 'login';
    let body = '';
    if (login) {
      body = `
        <label class="au-field"><span>メールアドレス</span><input id="au-email" type="email" autocomplete="username" value="${e(st.email)}"></label>
        <label class="au-field"><span>パスワード</span><input id="au-pw" type="password" autocomplete="current-password"></label>
        <button class="btn au-main" data-auth="login">ログイン</button>`;
    } else if (st.step === 1) {
      body = `
        <label class="au-field"><span>ニックネーム</span><input id="au-name" type="text" maxlength="20" autocomplete="nickname" value="${e(st.name)}" placeholder="例：花子"></label>
        <label class="au-field"><span>メールアドレス</span><input id="au-email" type="email" autocomplete="username" value="${e(st.email)}"></label>
        <label class="au-field"><span>パスワード（6文字以上）</span><input id="au-pw" type="password" autocomplete="new-password"></label>
        <button class="btn au-main" data-auth="next">次へ：場所をえらぶ</button>`;
    } else {
      body = `
        <p class="au-step">2 / 2　近くのお店を出すために、よく買い物する場所をえらんでください。</p>
        <label class="au-field"><span>エリア</span>
          <select id="au-area">${areaList().map((a) => `<option value="${a.id}" ${a.id === st.area ? 'selected' : ''}>${e(a.name)}</option>`).join('')}</select>
        </label>
        <button class="link small" data-auth="locate">現在地から近くのお店を探す</button>${st.locMsg ? `<span class="au-loc small">${e(st.locMsg)}</span>` : ''}
        <ul class="au-stores">${areaList().find((a) => a.id === st.area).stores.map((s) => `<li>${e(s.name)}<span>${e(s.type)}${s.walk ? '・徒歩' + s.walk + '分' : ''}</span></li>`).join('')}</ul>
        ${st.area === 'here' ? `<p class="au-note small">${OSM_CREDIT}。価格は実際のお店の価格ではなくサンプルです。</p>` : ''}
        <fieldset class="au-field"><legend>ふだんの移動手段</legend>
          <div class="au-radios">${Object.entries(TRANSPORTS).map(([k, t]) => `<label><input type="radio" name="au-tr" value="${k}" ${st.transport === k ? 'checked' : ''}>${t.label}</label>`).join('')}</div>
        </fieldset>
        <button class="btn au-main" data-auth="signup">はじめる</button>
        <button class="link small" data-auth="back">← もどる</button>`;
    }
    box.innerHTML = `<div class="au-card">
      <div class="au-brand">
        <svg class="logo" viewBox="0 0 64 64" fill="none" stroke="#3b3631" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M30 30 C 29 20, 33 12, 40.5 5.5" stroke="#7f9f7a"/><path d="M35.5 30.5 C 37 22, 42 15.5, 49 11.5" stroke="#7f9f7a"/>
          <path d="M22.5 31 L 16.8 16.5 C 16.2 13.4, 20 12.6, 21.2 15.2 L 27.5 30" fill="#f2c9a8" stroke="#c9775a"/>
          <path d="M8 30.6 C 20 29.2, 44 29.6, 56.2 31.2 L 51.6 52.8 C 51.1 55, 49.6 56.3, 47.1 56.1 C 37 56.9, 26 56.7, 17.2 56 C 14.9 55.8, 13.5 54.6, 13.1 52.5 Z" fill="#f6e7c8"/>
          <path d="M13.8 39.2 C 26 38.1, 40 38.7, 52.2 39.6 M 15.6 47.2 C 27 46.5, 39 46.9, 50.2 47.6" opacity=".5"/>
        </svg>
        <div><h1>こんだて逆算ノート</h1><p class="tagline">献立から、いちばん安い買い方と使い切りまで。</p></div>
      </div>
      <div class="au-tabs" role="tablist">
        <button role="tab" aria-selected="${login}" class="${login ? 'is-on' : ''}" data-auth="mode-login">ログイン</button>
        <button role="tab" aria-selected="${!login}" class="${!login ? 'is-on' : ''}" data-auth="mode-signup">新規登録</button>
      </div>
      ${fromGuest && !login ? '<p class="au-note">ゲストで使っていた記録は、新しいアカウントに引き継がれます。</p>' : ''}
      <form class="au-form" novalidate>${body}</form>
      ${st.msg ? `<p class="au-msg" role="alert">${e(st.msg)}</p>` : ''}
      <div class="au-sep"><span>または</span></div>
      <button class="btn-soft au-guest" data-auth="guest">ゲストで試す</button>
      <button class="link au-store-link" data-auth="side-store">お店・企業の方はこちら →</button>
      <p class="au-note small">デモ版のため、アカウントと記録はこの端末のブラウザの中だけに保存されます。ふだん使っているパスワードは使わないでください。</p>
    </div>`;
  }

  function read() {
    const v = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
    if (v('au-name') !== null) st.name = v('au-name').trim();
    if (v('au-email') !== null) st.email = v('au-email').trim();
    if (v('au-pw') !== null) st.pw = v('au-pw');
    if (v('au-area') !== null) st.area = v('au-area');
    if (v('au-slot') !== null) st.slot = v('au-slot');
    if (v('au-code') !== null) st.code = v('au-code').trim().toUpperCase();
    const tr = document.querySelector('input[name=au-tr]:checked');
    if (tr) st.transport = tr.value;
  }

  async function act(a) {
    read();
    st.msg = '';
    if (a === 'side-store') { st.side = 'store'; st.mode = 'slogin'; }
    if (a === 'side-user') { st.side = 'user'; st.mode = 'login'; st.step = 1; }
    if (a === 'mode-slogin' || a === 'mode-screate' || a === 'mode-sjoin') st.mode = a.slice(5);
    if (a === 'mode-screate') { const reg = STORE_REG.all(); st.slot = (['A', 'B', 'C'].find((k) => !reg[st.area + ':' + k])) || 'A'; }
    const validNew = () => {
      const accs = AUTH.accounts();
      if (!st.name) return '担当者名を入れてください。';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(st.email)) return 'メールアドレスの形を確認してください。';
      if (st.pw.length < 6) return 'パスワードは6文字以上にしてください。';
      if (Object.values(accs).some((x) => (x.email || '').toLowerCase() === st.email.toLowerCase())) return 'このメールアドレスはもう登録されています。ログインしてください。';
      return '';
    };
    const makeStoreAccount = async (storeKey) => {
      const accs = AUTH.accounts();
      const id = 's' + Date.now().toString(36);
      accs[id] = { name: st.name, email: st.email, hash: await hashPassword(st.email, st.pw), role: 'store', storeKey, createdAt: new Date().toISOString() };
      AUTH.set('kd-accounts', accs);
      return id;
    };
    if (a === 'screate') {
      const reg = STORE_REG.all();
      const key = st.area + ':' + st.slot;
      const err = validNew();
      if (err) st.msg = err;
      else if (reg[key]) st.msg = 'この店舗はもう登録されています。「店舗に参加」から、店舗コードを入力して参加してください。';
      else {
        const area = AREAS.find((x) => x.id === st.area);
        const id = await makeStoreAccount(key);
        reg[key] = { name: area.stores['ABC'.indexOf(st.slot)].name, area: st.area, slot: st.slot, code: newStoreCode(), members: [id], createdAt: new Date().toISOString() };
        STORE_REG.save(reg);
        AUTH.set('kd-session', id);
        localStorage.setItem(`kd:${id}:kd-store-welcome`, 'true');
        location.reload();
        return;
      }
    }
    if (a === 'sjoin') {
      // スタッフ：店舗コード＋名前だけで入る（同じ名前があればその人として、なければ新しく登録）
      const reg = STORE_REG.all();
      const hit = Object.entries(reg).find(([, x]) => x.code === st.code);
      const norm = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();
      st.name = st.name.replace(/[<>&"'`]/g, '').trim().slice(0, 20);
      if (!st.code) st.msg = '店舗コードを入れてください。';
      else if (!hit) st.msg = '店舗コードが見つかりません。担当者に確認してください。';
      else if (!st.name) st.msg = '名前を入れてください。';
      else {
        const accs = AUTH.accounts();
        const store = hit[1];
        const same = store.members.find((m) => accs[m] && norm(accs[m].name) === norm(st.name));
        if (same && !accs[same].staff) st.msg = 'この名前は店舗の担当者です。「担当者」からメールアドレスでログインしてください。';
        else {
          let id = same;
          if (!id) {
            id = 's' + Date.now().toString(36);
            accs[id] = { name: st.name, role: 'store', staff: true, storeKey: hit[0], createdAt: new Date().toISOString() };
            AUTH.set('kd-accounts', accs);
            store.members.push(id);
            STORE_REG.save(reg);
          }
          AUTH.set('kd-session', id);
          location.reload();
          return;
        }
      }
    }
    if (a === 'slogin') {
      const accs = AUTH.accounts();
      const hit = Object.entries(accs).find(([, x]) => (x.email || '').toLowerCase() === st.email.toLowerCase());
      const hash = await hashPassword(st.email, st.pw);
      if (!hit || hit[1].hash !== hash) st.msg = 'メールアドレスかパスワードがちがいます。';
      else if (hit[1].role !== 'store') st.msg = 'このアカウントは一般の方のアカウントです。「一般の方のログインへ」からログインしてください。';
      else {
        const store = STORE_REG.all()[hit[1].storeKey];
        if (!store) st.msg = '店舗の登録が見つかりません。';
        else if (store.members.length > 1 && st.code !== store.code) st.msg = st.code ? '店舗コードがちがいます。' : 'この店舗は複数人で使っているので、店舗コードを入力してください。';
        else { AUTH.set('kd-session', hit[0]); location.reload(); return; }
      }
    }
    if (a === 'mode-login') { st.mode = 'login'; st.step = 1; }
    if (a === 'mode-signup') { st.mode = 'signup'; st.step = 1; }
    if (a === 'back') st.step = 1;
    if (a === 'locate') {
      st.locMsg = '現在地と近くのお店を探しています…'; draw();
      locateHere((area, m) => { if (area) { st.liveArea = area; st.area = 'here'; st.locMsg = '近くのお店が見つかりました。'; } else st.locMsg = m; draw(); });
      return;
    }
    if (a === 'next') {
      const accs = AUTH.accounts();
      if (!st.name) st.msg = 'ニックネームを入れてください。';
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(st.email)) st.msg = 'メールアドレスの形を確認してください。';
      else if (st.pw.length < 6) st.msg = 'パスワードは6文字以上にしてください。';
      else if (Object.values(accs).some((x) => (x.email || '').toLowerCase() === st.email.toLowerCase())) st.msg = 'このメールアドレスはもう登録されています。ログインしてください。';
      else { st.hash = await hashPassword(st.email, st.pw); st.step = 2; }
    }
    if (a === 'signup') {
      const accs = AUTH.accounts();
      const id = 'u' + Date.now().toString(36);
      accs[id] = { name: st.name, email: st.email, hash: st.hash, createdAt: new Date().toISOString() };
      const prefix = `kd:${id}:`;
      if (fromGuest) copyData('kd:guest:', prefix);
      else if (Object.keys(accs).length === 1) copyData('', prefix);
      localStorage.setItem(prefix + 'kd-settings', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem(prefix + 'kd-settings') || '{}'), { area: st.area, transport: st.transport, liveArea: st.area === 'here' ? st.liveArea : null })));
      AUTH.set('kd-accounts', accs);
      AUTH.set('kd-auth-from-guest', null);
      AUTH.set('kd-session', id);
      location.reload();
      return;
    }
    if (a === 'login') {
      const accs = AUTH.accounts();
      const hit = Object.entries(accs).find(([, x]) => (x.email || '').toLowerCase() === st.email.toLowerCase());
      const hash = await hashPassword(st.email, st.pw);
      if (!hit || hit[1].hash !== hash) st.msg = 'メールアドレスかパスワードがちがいます。';
      else if (hit[1].role === 'store') st.msg = 'お店のアカウントです。下の「お店・企業の方はこちら」からログインしてください。';
      else { AUTH.set('kd-session', hit[0]); location.reload(); return; }
    }
    if (a === 'guest') {
      AUTH.set('kd-session', 'guest');
      AUTH.set('kd-auth-from-guest', null);
      location.reload();
      return;
    }
    draw();
    const first = box.querySelector('input:not([type=radio]), select');
    if (first && a !== 'locate') first.focus();
  }

  box.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-auth]');
    if (!t) return;
    ev.preventDefault();
    act(t.dataset.auth);
  });
  box.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (st.side === 'store') { act(st.mode); return; }
    act(st.mode === 'login' ? 'login' : st.step === 1 ? 'next' : 'signup');
  });
  box.addEventListener('change', (ev) => {
    if (ev.target.id === 'au-area') {
      read();
      if (st.side === 'store') { const area = AREAS.find((x) => x.id === st.area); const reg = STORE_REG.all(); st.slot = (['A', 'B', 'C'].find((k) => !reg[area.id + ':' + k])) || 'A'; }
      draw();
    }
  });
  draw();
})();
