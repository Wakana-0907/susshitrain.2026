// 現在地のまわりのお店を探す
// 位置情報（ブラウザ）＋ OpenStreetMap のデータ（Overpass API）を使います。APIキーは不要です。

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// 業務用・大容量・ディスカウント系のスーパー（名前やブランドで判定）
const BULK_RE = /業務スーパー|オーケー|OKストア|^OK$|ロピア|LOPIA|トライアル|TRIAL|ビッグ・?エー|ジャパンミート|ハナマサ|ラ・ムー|ダイレックス|コストコ|アコレ|ベルク|ドン・キホーテ|MEGAドン|サンディ/i;

function distM(a, b) {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 直線距離から徒歩の分数をざっくり出す（道のりは直線の約1.25倍、分速80m）
const walkMin = (m) => Math.max(1, Math.round((m * 1.25) / 80));

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error('status ' + res.status);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('network');
}

async function fetchNearbyArea(lat, lng) {
  const here = [lat, lng];
  let supers = [], chem = [], stations = [];
  for (const radius of [1200, 2500]) {
    const q = `[out:json][timeout:20];(nwr["shop"="supermarket"](around:${radius},${lat},${lng});nwr["shop"="chemist"](around:${radius},${lat},${lng});node["railway"="station"](around:2000,${lat},${lng}););out center tags;`;
    const data = await overpass(q);
    supers = []; chem = []; stations = [];
    (data.elements || []).forEach((el) => {
      const t = el.tags || {};
      const pos = el.lat !== undefined ? [el.lat, el.lon] : el.center ? [el.center.lat, el.center.lon] : null;
      const name = t['name:ja'] || t.name || t.brand;
      if (!pos || !name) return;
      const item = { name, pos, dist: distM(here, pos), bulk: BULK_RE.test(name) || BULK_RE.test(t.brand || '') };
      if (t.shop === 'supermarket') supers.push(item);
      else if (t.shop === 'chemist') chem.push(item);
      else if (t.railway === 'station') stations.push(item);
    });
    if (supers.length >= 2) break;
  }
  const byDist = (a, b) => a.dist - b.dist;
  supers.sort(byDist); chem.sort(byDist); stations.sort(byDist);
  if (supers.length < 2) throw new Error('近くに使えるスーパーが2軒以上見つかりませんでした。一覧からエリアをえらんでください。');

  const A = supers.find((s) => !s.bulk) || supers[0];
  const B = supers.find((s) => s !== A && s.bulk) || supers.find((s) => s !== A);
  const C = chem[0] || supers.find((s) => s !== A && s !== B) || null;
  if (!C) throw new Error('近くにお店が3軒見つかりませんでした。一覧からエリアをえらんでください。');

  const st = stations[0];
  const stName = st ? (st.name.endsWith('駅') ? st.name : st.name + '駅') : '';
  const round = (v) => Math.round(v * 1000) / 1000; // 位置は約100mの粗さで保存
  return {
    id: 'here',
    live: true,
    name: stName ? `${stName}周辺（現在地）` : '現在地のまわり',
    center: [round(lat), round(lng)],
    updatedAt: new Date().toISOString(),
    stores: [
      { name: A.name, type: '近所のスーパー', walk: walkMin(A.dist) },
      { name: B.name, type: B.bulk ? '業務用・大容量' : 'スーパー', walk: walkMin(B.dist) },
      { name: C.name, type: chem[0] === C ? 'ドラッグストア' : 'スーパー', walk: walkMin(C.dist) },
    ],
    between: { AB: walkMin(distM(A.pos, B.pos)), AC: walkMin(distM(A.pos, C.pos)), BC: walkMin(distM(B.pos, C.pos)) },
    priceScale: { A: 1, B: B.bulk ? 1 : 1.02, C: chem[0] === C ? 1 : 0.98 },
    bSuper: !B.bulk, // 業務用でない普通のスーパー → 価格は近所のスーパーと同じ水準
    cSuper: chem[0] !== C, // ドラッグストアがない → 3軒目もスーパー
  };
}

// 位置情報を取って、近くのお店でエリアを作る
function locateHere(onDone) {
  if (!navigator.geolocation) { onDone(null, 'このブラウザでは現在地を使えません。一覧からえらんでください。'); return; }
  if (window.isSecureContext === false) { onDone(null, '現在地は https のページでしか使えません。一覧からえらんでください。'); return; }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try { onDone(await fetchNearbyArea(pos.coords.latitude, pos.coords.longitude), ''); }
      catch (e) { onDone(null, e.message && /見つかりません/.test(e.message) ? e.message : '近くのお店の情報を取れませんでした。通信を確認するか、一覧からえらんでください。'); }
    },
    (err) => onDone(null, err && err.code === 1 ? '位置情報の利用が許可されていません。ブラウザの設定で許可するか、一覧からえらんでください。' : '現在地を取得できませんでした。一覧からえらんでください。'),
    { timeout: 10000, maximumAge: 300000 },
  );
}

const OSM_CREDIT = 'お店の情報：© OpenStreetMap contributors';
