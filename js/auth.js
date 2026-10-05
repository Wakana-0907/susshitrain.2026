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
  const st = { mode: AUTH.get('kd-auth-mode', 'login'), step: 1, name: '', email: '', pw: '', area: AREAS[0].id, transport: 'bike', msg: '', locMsg: '', liveArea: null };
  const areaList = () => (st.liveArea ? [st.liveArea, ...AREAS] : AREAS);
  AUTH.set('kd-auth-mode', null);
  const e = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function draw() {
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
      <p class="au-note small">デモ版のため、アカウントと記録はこの端末のブラウザの中だけに保存されます。ふだん使っているパスワードは使わないでください。</p>
    </div>`;
  }

  function read() {
    const v = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
    if (v('au-name') !== null) st.name = v('au-name').trim();
    if (v('au-email') !== null) st.email = v('au-email').trim();
    if (v('au-pw') !== null) st.pw = v('au-pw');
    if (v('au-area') !== null) st.area = v('au-area');
    const tr = document.querySelector('input[name=au-tr]:checked');
    if (tr) st.transport = tr.value;
  }

  async function act(a) {
    read();
    st.msg = '';
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
      else if (Object.values(accs).some((x) => x.email.toLowerCase() === st.email.toLowerCase())) st.msg = 'このメールアドレスはもう登録されています。ログインしてください。';
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
      const hit = Object.entries(accs).find(([, x]) => x.email.toLowerCase() === st.email.toLowerCase());
      const hash = await hashPassword(st.email, st.pw);
      if (!hit || hit[1].hash !== hash) st.msg = 'メールアドレスかパスワードがちがいます。';
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
    act(st.mode === 'login' ? 'login' : st.step === 1 ? 'next' : 'signup');
  });
  box.addEventListener('change', (ev) => { if (ev.target.id === 'au-area') { read(); draw(); } });
  draw();
})();
