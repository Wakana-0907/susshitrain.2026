// はじめての人向けの使い方（チュートリアル）
// 初回ログイン時（ゲストも）に表示。スキップでき、アカウント画面からいつでも見直せる。

const TUTORIAL = (() => {
  const C = { blue: '#4a90b8', wash: '#e4f0f7', line: '#c9dbe6', ink: '#24323a', egg: '#f2b84b', eggw: '#fdf3dc', green: '#5fa77f', greenw: '#e6f4ec', red: '#e07a5f', redw: '#fcebe5' };
  const svg = (inner) => `<svg viewBox="0 0 240 150" role="img" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const card = (x, y, w, h, fill = '#fff', stroke = C.line) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  const bar = (x, y, w, c = C.line) => `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="${c}"/>`;
  const plus = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="9" fill="${C.blue}"/><path d="M${cx - 4} ${cy}h8M${cx} ${cy - 4}v8" stroke="#fff" stroke-width="2"/>`;
  const check = (x, y, on) => `<rect x="${x}" y="${y}" width="14" height="14" rx="4" fill="${on ? C.blue : '#fff'}" stroke="${on ? C.blue : C.line}" stroke-width="1.5"/>${on ? `<path d="M${x + 3.5} ${y + 7.5}l2.5 2.5 5-5.5" stroke="#fff" stroke-width="2"/>` : ''}`;

  const SLIDES = [
    {
      title: 'こんだて逆算ノートへようこそ',
      text: '作りたい献立をえらぶと、近くのお店の価格から、いちばん安い買い方と、食材を使い切る方法を教えてくれるアプリです。使い方を1分でかんたんに紹介します。',
      art: svg(`
        <path d="M70 70h100l-9 52a8 8 0 0 1-8 6.5H87a8 8 0 0 1-8-6.5z" fill="${C.eggw}" stroke="${C.ink}" stroke-width="2"/>
        <path d="M84 92h72M88 110h64" stroke="${C.ink}" stroke-width="1.5" opacity=".4"/>
        <path d="M112 70c-2-18 4-34 18-46M124 70c3-16 11-28 24-36" stroke="${C.green}" stroke-width="3"/>
        <path d="M94 70l-9-24c-1-5 5-6 7-2l9 26" fill="#f6c9a6" stroke="${C.red}" stroke-width="2"/>
        <circle cx="186" cy="44" r="16" fill="${C.wash}"/><text x="186" y="49" text-anchor="middle" font-size="14" font-weight="700" fill="${C.blue}">¥</text>
        <circle cx="52" cy="48" r="12" fill="${C.greenw}"/><path d="M46 48l4 4 8-8" stroke="${C.green}" stroke-width="2.4"/>`),
    },
    {
      step: 1,
      title: '献立をえらぶ',
      text: '作りたい献立の「＋」を押します（1人分ずつ）。上のタグで「主菜」「汁物」などに絞りこめます。一覧にない献立は「献立を追加する」で名前を入れると、AIが食材を入れてくれます。',
      art: svg(`
        ${card(18, 16, 204, 26, C.wash, C.blue)}<text x="30" y="34" font-size="11" fill="${C.ink}">親子丼</text>${bar(30, 37, 50)}${plus(204, 29)}
        ${card(18, 50, 204, 26)}<text x="30" y="68" font-size="11" fill="${C.ink}">肉じゃが</text>${plus(204, 63)}
        ${card(18, 84, 204, 26)}<text x="30" y="102" font-size="11" fill="${C.ink}">しめじと豆腐のみそ汁</text>${plus(204, 97)}
        <rect x="18" y="120" width="204" height="22" rx="11" fill="#fff" stroke="${C.blue}" stroke-dasharray="4 3"/><text x="120" y="135" text-anchor="middle" font-size="10" fill="${C.blue}">＋ 献立を追加する（AIで食材を入れる）</text>
        <path d="M200 44c8 8 12 14 10 22" stroke="${C.egg}" stroke-width="2" stroke-dasharray="3 3"/>`),
    },
    {
      step: 2,
      title: '買い方を見る',
      text: '近くのお店3軒の価格から、合計がいちばん安い買い方を出します。2軒目に寄るとどれだけおトクかも分かります。余りそうな食材と、それを使い切れる献立も教えてくれます。',
      art: svg(`
        ${card(18, 12, 204, 78, '#fff', C.blue)}
        <text x="32" y="32" font-size="10" fill="${C.blue}" font-weight="700">おすすめの買い方</text>
        <text x="32" y="50" font-size="12" fill="${C.ink}" font-weight="700">Aマート → B業務館</text>
        <text x="32" y="78" font-size="22" fill="${C.blue}" font-weight="700">¥2,444</text>
        <rect x="140" y="62" width="70" height="20" rx="10" fill="${C.greenw}"/><text x="175" y="76" text-anchor="middle" font-size="10" fill="${C.green}">¥100 おトク</text>
        ${card(18, 100, 204, 40, C.redw, '#f3c3b5')}
        <text x="32" y="117" font-size="10" fill="${C.ink}" font-weight="700">早めに使いたい残り</text>
        <rect x="32" y="123" width="52" height="11" rx="5.5" fill="#fff"/><rect x="90" y="123" width="60" height="11" rx="5.5" fill="#fff"/>`),
    },
    {
      step: 3,
      title: '買い物する',
      text: 'お店では、買い物リストの食材に ✓ をつけていきます。値段や個数がちがったら「変更」で直せます。買い終わったら「買った！記録する」を押します。',
      art: svg(`
        ${card(18, 12, 204, 100)}
        <rect x="18" y="12" width="5" height="100" rx="2.5" fill="${C.green}"/>
        ${check(34, 24, true)}<text x="56" y="35" font-size="11" fill="${C.ink}" opacity=".55">玉ねぎ</text><text x="196" y="35" text-anchor="end" font-size="10" fill="${C.ink}">¥154</text>
        ${check(34, 48, true)}<text x="56" y="59" font-size="11" fill="${C.ink}" opacity=".55">豚こま肉</text><text x="196" y="59" text-anchor="end" font-size="10" fill="${C.ink}">¥338</text>
        ${check(34, 72, false)}<text x="56" y="83" font-size="11" fill="${C.ink}">キャベツ</text><text x="196" y="83" text-anchor="end" font-size="10" fill="${C.ink}">¥198</text>
        <text x="210" y="102" text-anchor="end" font-size="9" fill="${C.blue}">変更</text>
        <rect x="120" y="120" width="102" height="24" rx="12" fill="${C.blue}"/><text x="171" y="136" text-anchor="middle" font-size="10" fill="#fff" font-weight="700">買った！記録する</text>`),
    },
    {
      step: 4,
      title: '家にある食材',
      text: '記録すると、余った食材が「家の食材」に入ります。次に献立をえらぶと、家にある食材を先に使って、足りない分だけを買い物リストに出します。',
      art: svg(`
        ${card(18, 14, 120, 120, C.greenw, '#bfe0cc')}
        <text x="30" y="34" font-size="10" fill="${C.green}" font-weight="700">家にある食材</text>
        <rect x="30" y="44" width="70" height="16" rx="8" fill="#fff"/><text x="38" y="56" font-size="9" fill="${C.ink}">卵 8個</text>
        <rect x="30" y="66" width="90" height="16" rx="8" fill="#fff"/><text x="38" y="78" font-size="9" fill="${C.ink}">キャベツ 3/4玉</text>
        <rect x="30" y="88" width="80" height="16" rx="8" fill="#fff"/><text x="38" y="100" font-size="9" fill="${C.ink}">玉ねぎ 1個</text>
        <path d="M146 74h22" stroke="${C.blue}" stroke-width="2.2"/><path d="M162 68l7 6-7 6" stroke="${C.blue}" stroke-width="2.2"/>
        ${card(176, 34, 50, 80)}
        <text x="201" y="54" text-anchor="middle" font-size="9" fill="${C.ink}">次の</text><text x="201" y="66" text-anchor="middle" font-size="9" fill="${C.ink}">買い物</text>
        ${bar(186, 80, 30, C.wash)}${bar(186, 92, 22, C.wash)}`),
    },
    {
      title: 'ほかにもできること',
      text: '下のメニューから切りかえられます。「価格メモ」ではレシートをカメラで撮って価格を更新、「きろく」では払った金額をふり返れます。場所や移動手段は「アカウント」で変えられます。',
      art: svg(`
        ${card(14, 18, 64, 82)}
        <path d="M30 44h8l4-6h16l4 6h8v30H30z" stroke="${C.blue}" stroke-width="2" transform="translate(-8 0) scale(1)"/>
        <circle cx="46" cy="58" r="8" stroke="${C.blue}" stroke-width="2"/><text x="46" y="92" text-anchor="middle" font-size="9" fill="${C.ink}">価格メモ</text>
        ${card(88, 18, 64, 82)}
        <path d="M108 36h18l6 6v32h-24z" stroke="${C.blue}" stroke-width="2"/><path d="M113 52h14M113 60h14M113 68h8" stroke="${C.blue}" stroke-width="1.6"/>
        <text x="120" y="92" text-anchor="middle" font-size="9" fill="${C.ink}">きろく</text>
        ${card(162, 18, 64, 82)}
        <circle cx="194" cy="50" r="13" fill="${C.wash}"/><text x="194" y="55" text-anchor="middle" font-size="12" font-weight="700" fill="${C.blue}">花</text>
        <text x="194" y="92" text-anchor="middle" font-size="9" fill="${C.ink}">アカウント</text>
        <rect x="14" y="112" width="212" height="28" rx="14" fill="#fff" stroke="${C.line}"/>
        ${[34, 77, 120, 163, 206].map((x, i) => `<circle cx="${x}" cy="126" r="${i === 0 ? 5 : 4}" fill="${i === 0 ? C.blue : C.line}"/>`).join('')}`),
    },
  ];

  let i = 0;
  let animate = false;
  let lastFocus = null;
  let touchX = null;

  function el() { return document.getElementById('tutorial'); }

  function draw() {
    const s = SLIDES[i];
    const last = i === SLIDES.length - 1;
    el().innerHTML = `<div class="tu-back" data-tu="skip"></div>
      <div class="tu-card ${animate ? 'tu-anim' : ''}" role="dialog" aria-modal="true" aria-labelledby="tu-title">
        <div class="tu-top">
          <span class="tu-count">${i + 1} / ${SLIDES.length}</span>
          <button class="tu-skip" data-tu="skip">${last ? '閉じる' : 'スキップ'}</button>
        </div>
        <div class="tu-art">${s.art}</div>
        ${s.step ? `<p class="tu-step">ステップ ${s.step}</p>` : ''}
        <h2 id="tu-title">${s.title}</h2>
        <p class="tu-text">${s.text}</p>
        <div class="tu-dots" aria-hidden="true">${SLIDES.map((_, k) => `<span class="${k === i ? 'is-on' : ''}"></span>`).join('')}</div>
        <div class="tu-nav">
          ${i > 0 ? '<button class="btn-soft" data-tu="prev">もどる</button>' : '<span></span>'}
          ${last
            ? `<div class="tu-end"><button class="btn-soft" data-tu="try">サンプルで試す</button><button class="btn" data-tu="done">はじめる</button></div>`
            : '<button class="btn" data-tu="next">次へ</button>'}
        </div>
      </div>`;
    animate = false;
    const main = el().querySelector('[data-tu="next"], [data-tu="done"]');
    if (main) main.focus();
  }

  function open() {
    if (!el()) return;
    i = 0;
    lastFocus = document.activeElement;
    el().hidden = false;
    document.body.classList.add('tu-open');
    animate = true;
    draw();
  }

  function close(markDone = true) {
    if (!el() || el().hidden) return;
    el().hidden = true;
    el().innerHTML = '';
    document.body.classList.remove('tu-open');
    if (markDone) LS.set('kd-tutorial-done', true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function act(a) {
    if (a === 'next' && i < SLIDES.length - 1) { i++; draw(); }
    else if (a === 'prev' && i > 0) { i--; draw(); }
    else if (a === 'skip' || a === 'done') close();
    else if (a === 'try') {
      close();
      state.tab = 'shop';
      state.counts = { ...SAMPLE_MENU };
      state.step = 1;
      save();
      render();
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tu]');
    if (t && el().contains(t)) { e.preventDefault(); e.stopPropagation(); act(t.dataset.tu); }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!el() || el().hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') act('next');
    if (e.key === 'ArrowLeft') act('prev');
    if (e.key === 'Tab') {
      const f = [...el().querySelectorAll('button')];
      if (!f.length) return;
      const first = f[0], lastB = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastB.focus(); }
      else if (!e.shiftKey && document.activeElement === lastB) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('touchstart', (e) => { if (el() && !el().hidden) touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchX === null || !el() || el().hidden) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) act(dx < 0 ? 'next' : 'prev');
  }, { passive: true });

  return { open, close };
})();

// 初めてログインしたとき（ゲストも）に自動で表示
if (AUTH.user && !IS_STORE && !LS.get('kd-tutorial-done', false)) {
  setTimeout(() => TUTORIAL.open(), 300);
}
