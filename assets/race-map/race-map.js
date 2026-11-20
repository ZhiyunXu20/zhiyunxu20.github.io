/* Race Map — hierarchical race map (world → country → province) + race cards.
 * Data contract (see README in the race-map repo):
 *   races: [{ id, date, country, name{en,zh}, city{en,zh}, lat, lng, loc_precision,
 *            geo{path:[top, prov, unit]}, sport, category, distance_km, elev_m,
 *            status, time, time_source, tags[], links{website,strava} }]
 *   i18n:  { en:{key:text}, "zh-Hans":{key:text} }
 * World & country views use equal-area projections (Equal Earth / conic equal-area)
 * and no national borders; the province view is a zoomable street map (Leaflet). */
(function () {
  'use strict';
  var root = document.getElementById('race-map');
  if (!root) return;
  var GEO = root.getAttribute('data-geo');
  var RACES = (JSON.parse(document.getElementById('rm-races').textContent || '{}').races || [])
    .filter(function (r) { return r.geo && r.geo.path && r.lat != null; });
  var DATA = JSON.parse(document.getElementById('rm-races').textContent || '{}');
  var KEYNAMES = DATA.names || {};           // names for district / township keys (geo.path[3])
  var I18N = JSON.parse(document.getElementById('rm-i18n').textContent || '{}');

  // ---------- text ----------
  var UI = {
    en: {
      multi: 'Multisport', special: 'Special', sp_itra: 'ITRA', sp_utmb: 'UTMB', sp_edition: 'Milestone editions', sp_series: 'Race series', sp_itra_t: 'Races with ITRA points or an ITRA performance score', sp_utmb_t: 'UTMB Index races and by UTMB events', sp_edition_t: '1st edition or every 5th (10th, 25th, 50th…)', sp_series_t: 'World Marathon Majors, SuperHalfs, European Marathon Classics, IRONMAN, T100',
      world: 'World', races: 'races', race: 'race', places: 'Places', all: 'All', search: 'Search race or city',
      count: '{n} races', none: 'No races match.', hint_world: 'Drag to turn the map, scroll or pinch to zoom. Colour shows how many races each finer area holds; click an area to open the next level.',
      hint_region: 'Colour shows how many races each finer area holds. Click an area to open the next level.',
      hint_region_tw: 'Colour shows how many races each finer area holds. Click an area to open the next level.',
      hint_street: 'Scroll or pinch to zoom. Click a point for race details; a numbered circle groups several races, click it for more detail.',
      legend: 'Races', time_official: 'Official time', time_strava: 'Strava time', rank: 'Rank',
      dist: 'Distance', elev: 'Elevation', website: 'Race website', strava: 'View on Strava', leg_swim: 'Swim', leg_bike: 'Bike', leg_run: 'Run', dnf: 'DNF',
      back: 'Back', summary: '{n} races · {c} countries & regions · {y}', loc_approx: 'Approximate location',
      show_map: 'Show on map', sport: 'Sport', zoom_in: 'Click to zoom in',
      hint_europe: 'Colour shows how many races each finer area holds. Click an area to open the next level.',
      intro: 'Road races, trail races, triathlons, rides and swims I have taken part in. Colour shows how many races took place in each area; click to go one level deeper, down to a street map where each point marks the start line recorded on Strava.'
    },
    zh: {
      multi: '多项目', special: '特色', sp_itra: 'ITRA', sp_utmb: 'UTMB', sp_edition: '特殊届次', sp_series: '特殊系列', sp_itra_t: '有 ITRA 积分或表现分的赛事', sp_utmb_t: 'UTMB 指数赛事和 by UTMB 赛事', sp_edition_t: '首届或逢五届（第 10、25、50 届…）', sp_series_t: '世界马拉松大满贯、SuperHalfs、欧洲马拉松经典赛、IRONMAN、T100',
      world: '世界', races: '场', race: '场', places: '地区', all: '全部', search: '搜索赛事或城市',
      count: '{n} 场', none: '没有符合条件的赛事。', hint_world: '拖动旋转地图，滚轮或双指缩放。颜色表示更细一级区域的赛事数量，点击区域进入下一级。',
      hint_region: '颜色表示更细一级区域的赛事数量，点击区域进入下一级。',
      hint_region_tw: '颜色表示更细一级区域的赛事数量，点击区域进入下一级。',
      hint_street: '滚轮或双指缩放，点击圆点查看赛事；带数字的圆圈表示这里有多场赛事，点击查看细节。',
      legend: '赛事数', time_official: '官方成绩', time_strava: 'Strava 用时', rank: '名次',
      dist: '距离', elev: '爬升', website: '赛事官网', strava: 'View on Strava', leg_swim: '游泳', leg_bike: '骑行', leg_run: '跑步', dnf: '未完赛',
      back: '返回', summary: '{n} 场赛事 · {c} 个国家和地区 · {y}', loc_approx: '大致位置',
      show_map: '在地图上查看', sport: '项目', zoom_in: '点击放大查看',
      hint_europe: '颜色表示更细一级区域的赛事数量，点击区域进入下一级。',
      intro: '我参加过的路跑、越野跑、铁人三项、骑行和游泳赛事。颜色表示各区域的赛事数量，点击逐级深入，直到街道地图，每个点是 Strava 记录的起点。'
    }
  };
  var lang = 'en';
  try { var saved = localStorage.getItem('rm-lang'); if (saved === 'zh' || saved === 'en') lang = saved; } catch (e) {}
  function u(k, vars) {
    var s = UI[lang][k] || UI.en[k] || k;
    if (vars) Object.keys(vars).forEach(function (v) { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  }
  function t(k) {
    var d = lang === 'zh' ? (I18N['zh-Hans'] || {}) : (I18N.en || {});
    return d[k] != null ? d[k] : ((I18N.en || {})[k] != null ? I18N.en[k] : k);
  }
  function loc(o) { return o ? (lang === 'zh' ? (o.zh || o.en) : (o.en || o.zh)) : ''; }
  function featName(p) { return lang === 'zh' ? (p.name_zh || p.name_en) : (p.name_en || unitNameEn[p.id] || p.name_zh); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  // English names for Chinese city units, taken from the race data (GeoMapData has Chinese names only)
  var unitNameEn = {};
  RACES.forEach(function (r) { if (r.city && r.city.en && !unitNameEn[r.geo.path[2]]) unitNameEn[r.geo.path[2]] = r.city.en; });

  // ---------- hierarchy ----------
  // Region views (D3, equal-area): unit() = what a race colours, drill() = what a click opens.
  // keys() = the race's place keys below this region, used by the street map (province → city → district).
  // Macro-regions sit between the world and countries. One only appears once races exist in 2+ of its countries;
  // otherwise the world opens the country directly. East & Southeast Asia are reserved for later.
  function set(list) { var o = {}; list.split(' ').forEach(function (c) { o[c] = 1; }); return o; }
  var MACRO = {
    EU: { name: { en: 'Europe', zh: '欧洲' }, members: set('GB IE FR DE NL BE LU DK NO SE FI IS ES PT IT MT CH AT PL CZ SK HU SI HR GR CY EE LV LT RO BG'),
          rotate: [-9, -50], frame: [[-11, 34.5], [28, 34.5], [-11, 60.5], [28, 60.5], [9, 34], [9, 61]] },
    EA: { name: { en: 'East Asia', zh: '东亚' }, members: set('CN JP KR KP MN'),
          rotate: [-115, -35], frame: [[78, 18], [146, 18], [78, 52], [146, 52]] },
    SEA: { name: { en: 'Southeast Asia', zh: '东南亚' }, members: set('SG MY TH VN PH ID KH LA MM BN TL'),
          rotate: [-112, -5], frame: [[92, -11], [128, -11], [92, 23], [128, 23]] }
  };
  // grouped sub-units: units on one landmass share a single street map; separate islands open their own.
  var TW_OUTLYING = { 'TW-KIN': 1, 'TW-LIE': 1, 'TW-PEN': 1 };
  function twIsland(id) { return TW_OUTLYING[id] ? id : 'TW-MAIN'; }
  function dedupe(a) { return a.filter(function (k, i) { return k != null && k !== a[i - 1]; }); }
  var REG = {
    CN: { file: 'units-CN', parent: null, scope: function (p) { return p[0] === 'CN'; }, unit: function (p) { return p[2]; }, drill: function (p) { return p[1]; }, keys: function (p) { return dedupe([p[1], p[2], p[3]]); }, featDrill: function (f) { return f.properties.prov; }, name: { en: 'China', zh: '中国' } },
    TW: { file: 'units-TW', parent: 'CN', scope: function (p) { return p[1] === 'TW'; }, unit: function (p) { return p[2]; }, drill: function (p) { return twIsland(p[2]); }, keys: function (p) { return dedupe([twIsland(p[2]), p[2], p[3]]); }, featDrill: function (f) { return twIsland(f.properties.id); }, name: { en: 'Taiwan Region', zh: '台湾地区' }, crumbSkipParent: true }
  };
  ['GB', 'DE', 'NL', 'BE', 'DK', 'MT'].forEach(function (cc) {
    REG[cc] = { file: 'units-' + cc, parent: null, scope: function (p) { return p[0] === cc; }, unit: function (p) { return p[2]; }, drill: function (p) { return p[1]; }, keys: function (p) { return dedupe([p[1], p[2], p[3]]); }, featDrill: function (f) { return f.properties.prov; }, name: { en: t('country.' + cc), zh: (I18N['zh-Hans'] || {})['country.' + cc] } };
  });
  REG.GB.name = { en: 'United Kingdom', zh: '英国' };
  var macroOfCC = {};
  Object.keys(MACRO).forEach(function (id) {
    var M = MACRO[id], present = {};
    RACES.forEach(function (r) { if (M.members[r.geo.path[0]]) present[r.geo.path[0]] = 1; });
    if (Object.keys(present).length < 2) return;
    REG[id] = { macro: true, parent: null, name: M.name, scope: function (p) { return !!M.members[p[0]]; }, unit: function (p) { return p[1]; }, drill: function (p) { return p[0]; } };
    Object.keys(M.members).forEach(function (cc) { macroOfCC[cc] = id; if (REG[cc]) REG[cc].parent = id; });
  });
  function topFor(cc) { return macroOfCC[cc] || cc; }
  var SKIP_TO_STREET = { MT: 'MT' };         // single-province countries open the street map directly
  var STREET_FILE = { HK: 'units-HK' };      // finer outline for some street views
  var CLUSTER_MAX = 3;                       // a place with more races than this shows as a numbered circle you click into
  var unitProps = {};                        // unit id -> feature properties (filled as boundary files load)

  // The region a race's street map belongs to, and its keys below that region.
  function raceRegion(p) { var reg = p[0]; if (REG.TW.scope(p) && reg === 'CN') return 'TW'; return reg; }
  function raceKeys(r) { return REG[raceRegion(r.geo.path)].keys(r.geo.path); }

  // view: {level:'world'} | {level:'region', id} | {level:'street', region, trail:[province, city?, district?]}
  var view = { level: 'world' };
  var filters = { sport: null, special: null, q: '' };
  // Sport filter groups: triathlon + duathlon = multisport.
  var SPORT_GROUP = { triathlon: 'multi', duathlon: 'multi' };
  function sportGroup(r) { return SPORT_GROUP[r.sport] || r.sport; }
  // Special filters: race rating systems, milestone editions (1st, every 5th) and big race series.
  function hasTag(r, re) { return (r.tags || []).some(function (k) { return re.test(k); }); }
  function isMilestone(r) { return r.edition != null && (r.edition === 1 || r.edition % 5 === 0); }
  var SPECIAL = {
    itra: function (r) { return r.itra_score != null || hasTag(r, /^itra_/); },
    utmb: function (r) { return r.utmb_index != null || hasTag(r, /^(utmb_index|by_utmb)$/); },
    edition: isMilestone,
    series: function (r) { return hasTag(r, /^(wmm|emc|superhalfs|ironman|t100)$/); }
  };
  var cache = {}, worldTopo = null, dashTopo = null;
  var provNames = { 'TW-MAIN': { name_en: 'Taiwan Island', name_zh: '台湾岛' } };   // prov id -> {name_en,name_zh}

  function loadJSON(name) {
    if (!cache[name]) cache[name] = fetch(GEO + name + '.json').then(function (r) { if (!r.ok) throw new Error(name); return r.json(); });
    return cache[name];
  }

  // ---------- DOM ----------
  root.innerHTML =
    '<p class="rm-intro"></p>' +
    '<div class="rm-head">' +
    '  <nav class="rm-crumbs" aria-label="Map level"></nav>' +
    '  <div class="rm-lang" role="group" aria-label="Language"><button type="button" data-lang="en">EN</button><button type="button" data-lang="zh">中文</button></div>' +
    '</div>' +
    '<p class="rm-summary"></p>' +
    '<div class="rm-stage">' +
    '  <svg class="rm-svg" role="img"></svg>' +
    '  <div class="rm-leaflet" hidden></div>' +
    '  <div class="rm-tip" hidden></div>' +
    '  <div class="rm-loading" hidden>…</div>' +
    '</div>' +
    '<div class="rm-bar"><div class="rm-legend"></div><div class="rm-centers" role="group" hidden></div></div>' +
    '<p class="rm-hint"></p>' +
    '<div class="rm-places"></div>' +
    '<div class="rm-filters">' +
    '  <div class="rm-chips" role="group"></div>' +
    '  <div class="rm-chips rm-chips-x" role="group"></div>' +
    '  <input type="search" class="rm-search">' +
    '  <span class="rm-count"></span>' +
    '</div>' +
    '<div class="rm-cards"></div>' +
    '<p class="rm-src">Boundaries: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain); <a href="https://github.com/lyhmyd1211/GeoMapData_CN">GeoMapData_CN</a> (Aliyun DataV / Amap data, for study and display only); &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL), via <a href="https://www.geoboundaries.org/">geoBoundaries</a>. Race data powered by Strava.</p>';
  var $ = function (s) { return root.querySelector(s); };
  var svgEl = $('.rm-svg'), leafEl = $('.rm-leaflet'), tip = $('.rm-tip'), stage = $('.rm-stage');
  var svg = d3.select(svgEl);

  root.querySelectorAll('.rm-lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      lang = b.getAttribute('data-lang');
      try { localStorage.setItem('rm-lang', lang); } catch (e) {}
      render();
    });
  });
  $('.rm-search').addEventListener('input', function (e) { filters.q = e.target.value.trim().toLowerCase(); render(true); });

  // ---------- helpers ----------
  function filtered() {
    return RACES.filter(function (r) {
      if (filters.sport && sportGroup(r) !== filters.sport) return false;
      if (filters.special && !SPECIAL[filters.special](r)) return false;
      if (filters.q) {
        var hay = [r.name.en, r.name.zh, r.city.en, r.city.zh, t('country.' + r.country), r.date].join(' ').toLowerCase();
        if (hay.indexOf(filters.q) < 0) return false;
      }
      return true;
    });
  }
  function inScope(r, v) {
    var p = r.geo.path;
    if (v.level === 'world') return true;
    if (v.level === 'region') return REG[v.id].scope(p);
    if (raceRegion(p) !== v.region) return false;
    var k = raceKeys(r);
    for (var i = 0; i < v.trail.length; i++) if (k[i] !== v.trail[i]) return false;
    return true;
  }
  function countBy(list, fn) { var m = {}; list.forEach(function (r) { var k = fn(r); m[k] = (m[k] || 0) + 1; }); return m; }

  // Sequential blue ramp, binned (light → dark). Validated reference ramp; 0 = neutral.
  var BINS = [1, 2, 4, 10], RAMP = ['#9ec5f4', '#5598e7', '#256abf', '#104281'];
  function color(n) { if (!n) return null; var i = 0; while (i < BINS.length - 1 && n >= BINS[i + 1]) i++; return RAMP[i]; }
  function legendHTML() {
    var labels = ['1', '2–3', '4–9', '10+'];
    return '<span class="rm-legend-t">' + u('legend') + '</span>' +
      '<span class="rm-sw rm-sw0"></span><span>0</span>' +
      RAMP.map(function (c, i) { return '<span class="rm-sw" style="background:' + c + '"></span><span>' + labels[i] + '</span>'; }).join('');
  }

  function showTip(evt, html) {
    tip.innerHTML = html; tip.hidden = false;
    var b = stage.getBoundingClientRect(), x = evt.clientX - b.left + 14, y = evt.clientY - b.top + 14;
    if (x + tip.offsetWidth > b.width - 4) x = evt.clientX - b.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > b.height - 4) y = evt.clientY - b.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function nRaces(n) { return lang === 'zh' ? n + ' 场' : n + ' ' + (n === 1 ? 'race' : 'races'); }

  // ---------- navigation ----------
  function go(v, opts) {
    if (v.level === 'region' && SKIP_TO_STREET[v.id]) v = { level: 'street', region: v.id, trail: [SKIP_TO_STREET[v.id]] };
    view = v;
    if (!(opts && opts.noHash)) {
      var h = '#/';
      if (v.level === 'region') h += chain(v.id).join('/');
      if (v.level === 'street') h += chain(v.region).concat(v.trail).join('/');
      try { history.replaceState(null, '', h === '#/' ? location.pathname + location.search : h); } catch (e) {}
    }
    return render().then(function () { if (opts && opts.focus) focusRace(opts.focus); });
  }
  function chain(regionId) { var c = []; var r = regionId; while (r) { c.unshift(r); r = REG[r].parent; } return c; }
  function fromHash() {
    var segs = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!segs.length || !REG[segs[0]]) return { level: 'world' };
    var region = segs[0], i = 1;
    while (i < segs.length && REG[segs[i]] && REG[segs[i]].parent === region) { region = segs[i]; i++; }
    if (i >= segs.length) return { level: 'region', id: region };
    if (REG[region].macro) return { level: 'region', id: region };
    return { level: 'street', region: region, trail: segs.slice(i) };
  }
  function drillFromRegion(regionId, key) {
    if (REG[key] && REG[key].parent === regionId) return { level: 'region', id: key };
    return { level: 'street', region: regionId, trail: [key] };
  }
  // Go one level deeper while the next place still holds more than CLUSTER_MAX races.
  function viewForRace(r) {
    var reg = raceRegion(r.geo.path), keys = raceKeys(r), trail = [keys[0]], list = filtered();
    while (keys[trail.length]) {
      var next = trail.concat(keys[trail.length]);
      var n = list.filter(function (x) { return inScope(x, { level: 'street', region: reg, trail: next }); }).length;
      if (n > CLUSTER_MAX) trail = next; else break;
    }
    return { level: 'street', region: reg, trail: trail };
  }
  function sameView(a, b) { return a.level === b.level && a.region === b.region && (a.trail || []).join('/') === (b.trail || []).join('/'); }
  function keyName(key, depth) {
    if (depth === 0) return provName(key);
    var p = unitProps[key];
    if (p) return featName(p);
    var n = KEYNAMES[key];
    return n ? loc(n) : key;
  }

  // ---------- render ----------
  var renderToken = 0;
  function render(listOnly) {
    root.querySelectorAll('.rm-lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang); });
    root.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
    $('.rm-search').placeholder = u('search');
    $('.rm-intro').textContent = root.getAttribute('data-intro-' + lang) || u('intro');
    renderSummary(); renderChips(); renderCards();
    if (listOnly && view.level !== 'street') { return drawMap(); }
    if (listOnly) { updateMarkers(); return Promise.resolve(); }
    renderCrumbs();
    $('.rm-legend').innerHTML = legendHTML();
    $('.rm-hint').textContent = view.level === 'world' ? u('hint_world') : view.level === 'street' ? u('hint_street') : (REG[view.id] && REG[view.id].macro) ? u('hint_europe') : (view.id === 'TW' ? u('hint_region_tw') : u('hint_region'));
    return drawMap().then(function () { renderCrumbs(); renderPlaces(filtered()); });
  }

  function renderSummary() {
    var years = RACES.map(function (r) { return r.date.slice(0, 4); }).sort();
    var cs = {}; RACES.forEach(function (r) { cs[r.country] = 1; });
    $('.rm-summary').textContent = u('summary', { n: RACES.length, c: Object.keys(cs).length, y: years.length ? years[0] + '–' + years[years.length - 1] : '' });
  }

  function regionName(id) { return loc(REG[id].name); }
  function provName(id) { var p = provNames[id]; return p ? (lang === 'zh' ? (p.name_zh || p.name_en) : (p.name_en || p.name_zh)) : id; }
  function renderCrumbs() {
    var items = [{ label: u('world'), v: { level: 'world' } }];
    var reg = view.level === 'region' ? view.id : view.level === 'street' ? view.region : null;
    if (reg) chain(reg).filter(function (r, i, c) { return !(c[i + 1] && REG[c[i + 1]].crumbSkipParent); }).forEach(function (r) { items.push({ label: regionName(r), v: { level: 'region', id: r } }); });
    if (view.level === 'street') view.trail.forEach(function (k, i) {
      if (i === 0 && SKIP_TO_STREET[view.region]) return;
      items.push({ label: keyName(k, i), v: { level: 'street', region: view.region, trail: view.trail.slice(0, i + 1) } });
    });
    var nav = $('.rm-crumbs'); nav.innerHTML = '';
    items.forEach(function (it, i) {
      if (i) nav.appendChild(document.createTextNode(' › '));
      var last = i === items.length - 1, el = document.createElement(last ? 'span' : 'button');
      el.textContent = it.label;
      if (last) el.setAttribute('aria-current', 'page');
      else { el.type = 'button'; el.addEventListener('click', function () { go(it.v); }); }
      nav.appendChild(el);
    });
  }

  // Places list under the map: the clickable children of the current level (helps with tiny areas).
  function renderPlaces(list) {
    var box = $('.rm-places'); box.innerHTML = '';
    var groups = {}, label = {}, target = {};
    list.forEach(function (r) {
      var p = r.geo.path, k, v;
      if (view.level === 'world') { k = topFor(p[0]); v = { level: 'region', id: k }; label[k] = regionName(k); }
      else if (view.level === 'region') { var R = REG[view.id]; if (!R.scope(p)) return; k = R.drill(p); v = drillFromRegion(view.id, k); label[k] = REG[k] ? regionName(k) : provName(k); }
      else {
        if (!inScope(r, view)) return;
        k = raceKeys(r)[view.trail.length]; if (!k) return;
        v = { level: 'street', region: view.region, trail: view.trail.concat(k) }; label[k] = keyName(k, view.trail.length);
      }
      groups[k] = (groups[k] || 0) + 1; target[k] = v;
    });
    var keys = Object.keys(groups).filter(function (k) { return view.level !== 'street' || groups[k] > CLUSTER_MAX; })
      .sort(function (a, b) { return groups[b] - groups[a]; });
    if (!keys.length) return;
    var h = document.createElement('span'); h.className = 'rm-places-t'; h.textContent = u('places'); box.appendChild(h);
    keys.forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rm-place';
      b.innerHTML = esc(label[k]) + ' <span>' + groups[k] + '</span>';
      b.addEventListener('click', function () { go(target[k]); });
      box.appendChild(b);
    });
  }

  function renderChips() {
    var box = $('.rm-chips'); box.innerHTML = '';
    var order = ['road', 'trail', 'multi', 'bike', 'swim', 'track', 'fun'];
    var scoped = RACES.filter(function (r) { return inScope(r, view); });
    var present = countBy(scoped, sportGroup);
    [null].concat(order.filter(function (s) { return present[s]; })).forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rm-chip';
      b.textContent = s ? (s === 'multi' ? u('multi') : t('sport.' + s)) : u('all');
      b.setAttribute('aria-pressed', filters.sport === s);
      b.addEventListener('click', function () { filters.sport = s; render(true); });
      box.appendChild(b);
    });
    // second row: special filters (click again to clear)
    var bx = $('.rm-chips-x'); bx.innerHTML = '';
    var keys = ['itra', 'utmb', 'edition', 'series'].filter(function (k) { return scoped.some(SPECIAL[k]); });
    if (!keys.length) return;
    var h = document.createElement('span'); h.className = 'rm-places-t'; h.textContent = u('special'); bx.appendChild(h);
    keys.forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rm-chip';
      b.textContent = u('sp_' + k); b.title = u('sp_' + k + '_t');
      b.setAttribute('aria-pressed', filters.special === k);
      b.addEventListener('click', function () { filters.special = filters.special === k ? null : k; render(true); });
      bx.appendChild(b);
    });
  }
  function ordinal(n) { var v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }

  function fmtKm(km) { if (km == null) return ''; return (Math.abs(km - 42.195) < 0.01 ? '42.2' : Math.abs(km - 21.0975) < 0.01 ? '21.1' : (Math.round(km * 10) / 10).toString()) + ' km'; }
  function cardHTML(r, compact) {
    var place = [loc(r.city), r.country === 'GB' && r.region ? t('region.' + r.region) : null, t('country.' + r.country)].filter(Boolean);
    if (place[0] === place[place.length - 1]) place.pop();
    var stats = [];
    if (r.distance_km != null) stats.push(['dist', fmtKm(r.distance_km)]);
    if (r.elev_m) stats.push(['elev', Math.round(r.elev_m) + ' m']);
    if (r.time) stats.push([r.time_source === 'official' ? 'time_official' : 'time_strava', r.time]);
    if (r.rank_overall) stats.push(['rank', String(r.rank_overall)]);
    var tags = (r.tags || []).filter(function (k) { return k !== 'dnf'; }).map(function (k) { return '<span class="rm-tag">' + esc(t('tag.' + k)) + '</span>'; }).join('');
    if (isMilestone(r)) tags = '<span class="rm-tag">' + esc(lang === 'zh' ? '第 ' + r.edition + ' 届' : ordinal(r.edition) + ' edition') + '</span>' + tags;
    var links = [];
    // icon links: globe = race website; orange activity line = the Strava activity (label and tooltip read "View on Strava")
    if (r.links && r.links.website) links.push('<a class="rm-ico" href="' + esc(r.links.website) + '" target="_blank" rel="noopener" title="' + esc(u('website')) + '" aria-label="' + esc(u('website')) + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg></a>');
    var LEG_SVG = {
      swim: '<path d="M2 15c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M2 19c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 11l4-3 3 2 3-1"/>',
      bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-7h5l3 7M10 9l2 7M13 6h3"/>',
      run: '<path d="M3 13h4l3-7 4 12 3-5h4"/>'
    };
    function stravaIco(url, leg) {
      var label = u('strava') + (leg ? ' · ' + u('leg_' + leg) : '');
      return '<a class="rm-ico rm-strava" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(label) + '" aria-label="' + esc(label) + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (LEG_SVG[leg] || LEG_SVG.run) + '</svg></a>';
    }
    if (r.links && r.links.strava_legs && r.links.strava_legs.length) {
      var ORD = {swim: 0, bike: 1, run: 2};
      r.links.strava_legs.slice().sort(function (a, b) { return (a.leg in ORD ? ORD[a.leg] : 3) - (b.leg in ORD ? ORD[b.leg] : 3); }).forEach(function (l) { links.push(stravaIco(l.url, l.leg)); });
    } else if (r.links && r.links.strava) links.push(stravaIco(r.links.strava, null));
    var approx = r.loc_precision && !/^(strava|manual)/.test(r.loc_precision) ? ' <span class="rm-approx" title="' + esc(t('loc.' + r.loc_precision)) + '">≈</span>' : '';
    return '<div class="rm-card-top"><time>' + esc(r.date) + '</time><span class="rm-sport rm-s-' + esc(r.sport) + '">' + esc(t('sport.' + r.sport)) + '</span>' +
      (r.status === 'dnf' ? '<span class="rm-dnf">' + u('dnf') + '</span>' : '') + '</div>' +
      '<h3>' + esc(loc(r.name)) + '</h3>' +
      '<div class="rm-meta">' + esc(place.join(', ')) + approx + ' · ' + esc(t('category.' + r.category)) + '</div>' +
      (stats.length ? '<dl class="rm-stats">' + stats.map(function (s) { return '<div><dt>' + u(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('') + '</dl>' : '') +
      (!compact && tags ? '<div class="rm-tags">' + tags + '</div>' : '') +
      (links.length ? '<div class="rm-links">' + links.join('') + '</div>' : '');
  }
  var activeId = null;
  function renderCards() {
    var list = filtered(), scoped = list.filter(function (r) { return inScope(r, view); });
    scoped.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    $('.rm-count').textContent = u('count', { n: scoped.length });
    var box = $('.rm-cards'); box.innerHTML = '';
    if (!scoped.length) { box.innerHTML = '<p class="rm-empty">' + u('none') + '</p>'; }
    scoped.forEach(function (r) {
      var a = document.createElement('article'); a.className = 'rm-card' + (r.id === activeId ? ' is-active' : ''); a.setAttribute('data-id', r.id);
      a.tabIndex = 0; a.setAttribute('aria-label', u('show_map') + ': ' + loc(r.name));
      a.innerHTML = cardHTML(r);
      var open = function (e) { if (e.target.closest('a')) return; showRace(r); };
      a.addEventListener('click', open);
      a.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(e); });
      box.appendChild(a);
    });
    renderPlaces(list);
  }
  function showRace(r) {
    var v = viewForRace(r);
    if (sameView(view, v)) { focusRace(r.id); return; }
    go(v, { focus: r.id });
    stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function setActive(id) {
    activeId = id;
    root.querySelectorAll('.rm-card').forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-id') === id); });
  }

  // ---------- map drawing ----------
  var lmap = null, lmarkers = null, loutline = null, markerById = {};
  function drawMap() {
    var token = ++renderToken;
    hideTip();
    $('.rm-loading').hidden = false;
    var p = view.level === 'world' ? drawWorld(token) : view.level === 'region' ? (REG[view.id].macro ? drawMacro(token) : drawRegion(token)) : drawStreet(token);
    return p.catch(function (e) { console.error(e); }).then(function () { if (token === renderToken) $('.rm-loading').hidden = true; });
  }
  function size() { var w = stage.clientWidth || 800; return { w: w, h: Math.round(Math.min(Math.max(w * 0.56, 320), 620)) }; }
  function showSvg(on) { svgEl.style.display = on ? '' : 'none'; leafEl.hidden = on; $('.rm-legend').hidden = !on; $('.rm-centers').hidden = true; var c = stage.querySelector('.rm-wctl'); if (c) c.hidden = true; svg.on('.zoom', null); }
  // Zoom buttons over the map (world, Europe and country views); the street map has Leaflet's own.
  function zoomButtons(zoom) {
    var ctl = stage.querySelector('.rm-wctl');
    if (!ctl) { ctl = document.createElement('div'); ctl.className = 'rm-wctl'; stage.appendChild(ctl); }
    ctl.hidden = false;
    ctl.innerHTML = '<div class="rm-zbtns"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button></div>';
    ctl.querySelectorAll('[data-z]').forEach(function (btn) {
      btn.addEventListener('click', function () { svg.transition().duration(250).call(zoom.scaleBy, btn.getAttribute('data-z') === 'in' ? 1.6 : 1 / 1.6); });
    });
  }
  // Plain zoom & pan for the Europe and country maps. Content goes in zg; pins (small-place click targets) keep
  // their screen size and follow the zoom.
  function enableZoom(zg, pins, s) {
    var zoom = d3.zoom().scaleExtent([1, 12]).translateExtent([[0, 0], [s.w, s.h]]).extent([[0, 0], [s.w, s.h]]).clickDistance(4)
      .on('start', hideTip)
      .on('zoom', function (e) {
        var t = e.transform;
        zg.attr('transform', t);
        if (pins) pins.attr('transform', function (d) { var q = t.apply([d.x, d.y]); return 'translate(' + q[0] + ',' + q[1] + ')'; });
      });
    svg.call(zoom).on('dblclick.zoom', null);
    svg.property('__zoom', d3.zoomIdentity);
    zoomButtons(zoom);
  }
  // Click targets + labels for places too small to hit (outlying islands, Malta).
  function addPins(items, onMove, onLeave, onClick) {
    var g = svg.append('g').attr('class', 'rm-pins');
    var pins = g.selectAll('g').data(items).join('g').attr('class', 'rm-pin')
      .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    pins.append('circle').attr('class', 'rm-hit').attr('r', function (d) { return d.r; })
      .on('mousemove', function (e, d) { onMove(e, d); }).on('mouseleave', function (e, d) { onLeave(d); }).on('click', function (e, d) { onClick(d); });
    pins.append('text').attr('class', 'rm-islabel').attr('y', function (d) { return -d.r - 3; }).attr('text-anchor', 'middle').text(function (d) { return d.label; });
    return pins;
  }

  // World view state survives re-renders: central meridian (lambda), zoom (k), vertical offset (ty).
  var CENTERS = [{ lon: 0, en: '0°', zh: '0°' }, { lon: 60, en: '60°E', zh: '60°E' }, { lon: 150, en: '150°E', zh: '150°E' }];
  var ws = { lambda: 0, k: 1, ty: 0 };
  function drawWorld(token) {
    // world-lo.json is a simplified copy of world.json (same topology, fewer points) used while dragging/zooming.
    return Promise.all([loadJSON('world'), loadJSON('world-lo').catch(function () { return null; })]).then(function (res) {
      if (token !== renderToken) return;
      showSvg(true);
      worldTopo = res[0];
      var loTopo = res[1];
      var land = topojson.feature(worldTopo, worldTopo.objects.land);
      var provs = topojson.feature(worldTopo, worldTopo.objects.provinces).features;
      provs.forEach(function (f) { provNames[f.properties.prov] = f.properties; });
      // Shading always sits two levels below the view: inside an active macro-region (Europe) that is the country,
      // elsewhere the province. Clicking only opens the next level (the macro-region or the country).
      var inMacro = function (cc) { var m = macroOfCC[cc]; return !!(m && REG[m]); };
      var shadeKey = function (p) { return inMacro(p[0]) ? p[0] : p[1]; };
      var list = filtered(), counts = countBy(list, function (r) { return shadeKey(r.geo.path); });
      var topCounts = countBy(list, function (r) { return topFor(r.geo.path[0]); });
      var pgeoms = worldTopo.objects.provinces.geometries, units = [], byCC = {};
      pgeoms.forEach(function (g) { var cc = g.properties.cc; if (inMacro(cc)) (byCC[cc] = byCC[cc] || []).push(g); });
      provs.forEach(function (f) { if (!inMacro(f.properties.cc)) units.push({ type: 'Feature', properties: { key: f.properties.prov, cc: f.properties.cc, top: topFor(f.properties.cc), name: featName(f.properties) }, geometry: f.geometry }); });
      Object.keys(byCC).forEach(function (cc) {
        units.push({ type: 'Feature', properties: { key: cc, cc: cc, top: topFor(cc), name: REG[cc] ? regionName(cc) : t('country.' + cc) }, geometry: topojson.merge(worldTopo, byCC[cc]) });
      });
      // Low-detail geometry aligned with `units` (same order), drawn during gestures instead of the full-detail paths.
      var landLo = null, unitsLo = null;
      if (loTopo && loTopo.objects && loTopo.objects.provinces && loTopo.objects.provinces.geometries.length === pgeoms.length) {
        landLo = topojson.feature(loTopo, loTopo.objects.land);
        var provsLo = topojson.feature(loTopo, loTopo.objects.provinces).features, lgeoms = loTopo.objects.provinces.geometries, byCCLo = {};
        unitsLo = [];
        lgeoms.forEach(function (g) { var cc = g.properties.cc; if (inMacro(cc)) (byCCLo[cc] = byCCLo[cc] || []).push(g); });
        provsLo.forEach(function (f) { if (!inMacro(f.properties.cc)) unitsLo.push(f.geometry); });
        Object.keys(byCC).forEach(function (cc) { unitsLo.push(topojson.merge(loTopo, byCCLo[cc] || [])); });
        if (unitsLo.length !== units.length) { landLo = null; unitsLo = null; }
      }
      var topShape = {};
      function topGeom(top) {
        if (!topShape[top]) {
          var mg = topojson.merge(worldTopo, pgeoms.filter(function (g) { return topFor(g.properties.cc) === top; }));
          // the hover outline skips remote offshore polygons (shown in the country view's inset)
          if (top === 'CN') mg = { type: 'MultiPolygon', coordinates: mg.coordinates.filter(function (poly) { return d3.geoCentroid({ type: 'Polygon', coordinates: poly })[1] > 17.5; }) };
          topShape[top] = mg;
        }
        return topShape[top];
      }
      var hoverTop = null;
      var s = size();
      // Equal Earth keeps areas true at any central meridian and any uniform zoom.
      var fit = d3.geoEqualEarth().rotate([0, 0]).fitExtent([[6, 6], [s.w - 6, s.h - 6]], land);
      var s0 = fit.scale(), ty0 = fit.translate()[1];
      var mapH = s.h - 12;
      var proj = d3.geoEqualEarth(), path = d3.geoPath(proj);
      function apply() {
        var maxTy = Math.max(0, (ws.k * mapH - s.h) / 2 + 30);
        ws.ty = Math.max(-maxTy, Math.min(maxTy, ws.ty));
        proj.scale(s0 * ws.k).rotate([ws.lambda, 0]).translate([s.w / 2, ty0 + ws.ty]);
      }
      apply();
      svg.attr('viewBox', '0 0 ' + s.w + ' ' + s.h).attr('aria-label', u('world'));
      svg.selectAll('*').remove();
      svg.on('.zoom', null);
      var gLand = svg.append('path').attr('class', 'rm-land');
      var gProv = svg.append('g').selectAll('path').data(units).join('path')
        .attr('class', function (f) { return 'rm-prov' + (counts[f.properties.key] ? ' has' : ''); })
        .style('fill', function (f) { return color(counts[f.properties.key]); })
        .on('mousemove', function (e, f) {
          var P = f.properties, top = P.top;
          if (hoverTop !== top) { hoverTop = top; gHl.attr('d', path(topGeom(top))); }
          var html = '<b>' + esc(regionName(top)) + '</b> · ' + nRaces(topCounts[top] || 0);
          if (P.name !== regionName(top)) html += '<br>' + esc(P.name) + ' · ' + nRaces(counts[P.key] || 0);
          showTip(e, html);
        })
        .on('mouseleave', function () { hoverTop = null; gHl.attr('d', null); hideTip(); })
        .on('click', function (e, f) { go({ level: 'region', id: f.properties.top }); });
      // country-level overlays are only drawn in the country view
      var gHl = svg.append('path').attr('class', 'rm-hl');
      // lo = true while a gesture or animation is running: draw the simplified geometry (same projection, fewer points).
      function redraw(lo) {
        var useLo = lo && unitsLo;
        gLand.attr('d', path(useLo ? landLo : land));
        gProv.attr('d', useLo ? function (f, i) { return path(unitsLo[i]); } : path);
        if (hoverTop && !useLo) gHl.attr('d', path(topGeom(hoverTop)));
      }
      redraw();
      // Drag left/right turns the globe (changes the central meridian); drag up/down pans; wheel or pinch zooms.
      var prev = d3.zoomIdentity, raf = 0;
      var zoom = d3.zoom().scaleExtent([1, 8]).clickDistance(4)
        .on('start', function () { svgEl.classList.add('is-dragging'); hideTip(); })
        .on('zoom', function (e) {
          var t = e.transform, dk = t.k / prev.k;
          if (Math.abs(dk - 1) < 1e-6) {
            ws.lambda += (t.x - prev.x) / (s0 * ws.k) * 180 / Math.PI;
            ws.ty += t.y - prev.y;
          } else {
            var sc = s.h / (svgEl.getBoundingClientRect().height || s.h);
            var pt = e.sourceEvent ? d3.pointer(e.sourceEvent, svgEl) : [s.w / (2 * sc), s.h / (2 * sc)];
            var px = pt[0] * sc, py = pt[1] * sc, cy = ty0 + ws.ty;
            // keep the point under the cursor in place: vertical by offset, horizontal by turning the globe
            ws.lambda += (px - s.w / 2) * (1 / (s0 * ws.k) - 1 / (s0 * t.k)) * 180 / Math.PI;
            ws.k = t.k; ws.ty = py - (py - cy) * dk - ty0;
          }
          ws.lambda = ((ws.lambda + 540) % 360) - 180;
          prev = t;
          if (!raf) raf = requestAnimationFrame(function () { raf = 0; apply(); redraw(true); syncCenters(); });
        })
        .on('end', function () {
          svgEl.classList.remove('is-dragging');
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          apply(); redraw(false); syncCenters();
        });
      svg.call(zoom).on('dblclick.zoom', null);
      svg.property('__zoom', d3.zoomIdentity.scale(ws.k)); prev = d3.zoomIdentity.scale(ws.k);
      // Controls: zoom buttons on the map, centre presets in the bar below it
      zoomButtons(zoom);
      var ctl = $('.rm-centers');
      ctl.hidden = false;
      ctl.setAttribute('aria-label', lang === 'zh' ? '地图中心' : 'Map centre');
      ctl.innerHTML = '<span>' + (lang === 'zh' ? '地图中心' : 'Map centre') + '</span>' +
        CENTERS.map(function (c) { return '<button type="button" data-lon="' + c.lon + '">' + c[lang === 'zh' ? 'zh' : 'en'] + '</button>'; }).join('');
      ctl.querySelectorAll('[data-lon]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var from = ws.lambda, to = -(+btn.getAttribute('data-lon'));
          var d = ((to - from + 540) % 360) - 180;
          d3.transition().duration(500).tween('rotate', function () {
            return function (tt) { ws.lambda = from + d * tt; apply(); redraw(tt < 1); syncCenters(); };
          });
        });
      });
      function syncCenters() {
        ctl.querySelectorAll('[data-lon]').forEach(function (btn) { btn.setAttribute('aria-pressed', Math.abs(ws.lambda + (+btn.getAttribute('data-lon'))) < 0.5); });
      }
      syncCenters();
    });
  }

  function regionProjection(fc, s, pad) {
    var b = d3.geoBounds(fc), lat0 = b[0][1], lat1 = b[1][1], lngc = (b[0][0] + b[1][0]) / 2;
    var dl = lat1 - lat0; pad = pad || 10;
    return d3.geoConicEqualArea().parallels([lat0 + dl / 6, lat1 - dl / 6]).rotate([-lngc, 0]).fitExtent([[pad, pad], [s.w - pad, s.h - pad]], fc);
  }

  function drawRegion(token) {
    var R = REG[view.id];
    return Promise.all([loadJSON(R.file), loadJSON('world')]).then(function (res) {
      if (token !== renderToken) return;
      showSvg(true);
      var topo = res[0], obj = topo.objects.units, wt = res[1];
      var feats = topojson.feature(topo, obj).features;
      feats.forEach(function (f) { unitProps[f.properties.id] = f.properties; });
      feats.forEach(function (f) { if (R.featDrill(f) === f.properties.id || !provNames[R.featDrill(f)]) { /* fall through */ } });
      // first-level names for crumbs/places (grouped units are their own drill targets)
      if (view.id === 'TW') feats.forEach(function (f) { if (TW_OUTLYING[f.properties.id]) provNames[f.properties.id] = f.properties; });
      var list = filtered().filter(function (r) { return R.scope(r.geo.path); });
      var counts = countBy(list, function (r) { return R.unit(r.geo.path); });
      var groupCounts = countBy(list, function (r) { return R.drill(r.geo.path); });
      var s = size();
      var fc = { type: 'FeatureCollection', features: feats };
      // frame the main landmass and show remote islands in an inset
      var fitFC = view.id === 'CN' ? { type: 'FeatureCollection', features: feats.filter(function (f) { return d3.geoCentroid(f)[1] > 18; }) } : fc;
      var proj = regionProjection(fitFC, s, view.id === 'TW' ? 36 : 10), path = d3.geoPath(proj);
      svg.attr('viewBox', '0 0 ' + s.w + ' ' + s.h).attr('aria-label', regionName(view.id));
      svg.selectAll('*').remove();
      var zg = svg.append('g').attr('class', 'rm-zoomg'), pins = null;
      zg.append('path').attr('class', 'rm-land rm-land-ctx').attr('d', path(topojson.feature(wt, wt.objects.land)));
      var gUnits = zg.append('g');
      var hl = zg.append('path').attr('class', 'rm-hl');
      gUnits.selectAll('path').data(feats).join('path')
        .attr('class', function (f) { return 'rm-unit' + (counts[f.properties.id] ? ' has' : ''); })
        .attr('d', path)
        .style('fill', function (f) { return color(counts[f.properties.id]); })
        .on('mousemove', function (e, f) {
          var key = R.featDrill(f);
          var geoms = obj.geometries.filter(function (g) { return R.featDrill({ properties: g.properties }) === key; });
          hl.attr('d', path(topojson.merge(topo, geoms)));
          var gname = REG[key] ? regionName(key) : provName(key);
          var uname = featName(f.properties);
          var n = counts[f.properties.id] || 0, gn = groupCounts[key] || 0;
          showTip(e, '<b>' + esc(gname) + '</b> · ' + nRaces(gn) + (uname !== gname ? '<br>' + esc(uname) + ' · ' + nRaces(n) : ''));
        })
        .on('mouseleave', function () { hl.attr('d', null); hideTip(); })
        .on('click', function (e, f) { go(drillFromRegion(view.id, R.featDrill(f))); });
      // province borders (thicker) on top of unit borders
      zg.append('path').attr('class', 'rm-provline')
        .attr('d', path(topojson.mesh(topo, obj, function (a, b) { return a !== b && (view.id === 'TW' || R.featDrill({ properties: a.properties }) !== R.featDrill({ properties: b.properties })); })));
      // tiny islands: a larger invisible click target and a label so they can be reached
      if (view.id === 'TW') {
        var items = feats.filter(function (f) { return TW_OUTLYING[f.properties.id]; }).map(function (f) {
          var b = path.bounds(f);
          return { f: f, x: (b[0][0] + b[1][0]) / 2, y: (b[0][1] + b[1][1]) / 2, r: Math.max(14, Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) / 2 + 6), label: featName(f.properties) };
        });
        pins = addPins(items,
          function (e, d) { hl.attr('d', path(d.f)); showTip(e, '<b>' + esc(d.label) + '</b> · ' + nRaces(counts[d.f.properties.id] || 0)); },
          function () { hl.attr('d', null); hideTip(); },
          function (d) { go(drillFromRegion(view.id, d.f.properties.id)); });
      }
      if (view.id === 'CN') {
        var dash = topojson.feature(wt, wt.objects.dash);
        zg.append('path').attr('class', 'rm-dash').attr('d', path(dash));
        var iw = Math.round(Math.min(s.w * 0.16, 150)), ih = Math.round(iw * 1.45), ix = s.w - iw - 12, iy = s.h - ih - 12;
        var ip = d3.geoConicEqualArea().parallels([5, 20]).rotate([-114, 0]).fitExtent([[4, 4], [iw - 4, ih - 4]], dash);
        var ipath = d3.geoPath(ip);
        svg.append('clipPath').attr('id', 'rm-inset-clip').append('rect').attr('width', iw).attr('height', ih);
        var gi = svg.append('g').attr('class', 'rm-inset').attr('transform', 'translate(' + ix + ',' + iy + ')');
        gi.append('rect').attr('class', 'rm-inset-bg').attr('width', iw).attr('height', ih);
        var gc = gi.append('g').attr('clip-path', 'url(#rm-inset-clip)');
        gc.append('path').attr('class', 'rm-land rm-land-ctx').attr('d', ipath(topojson.feature(wt, wt.objects.land)));
        gc.selectAll('path.rm-unit').data(feats.filter(function (f) { var c = d3.geoCentroid(f); return c[1] < 26 && c[0] > 105; })).join('path')
          .attr('class', 'rm-unit').attr('d', ipath).style('fill', function (f) { return color(counts[f.properties.id]); }).style('pointer-events', 'none');
        gc.append('path').attr('class', 'rm-dash').attr('d', ipath(dash));
        gi.append('rect').attr('class', 'rm-inset-frame').attr('width', iw).attr('height', ih);
        gi.append('text').attr('class', 'rm-inset-label').attr('x', iw - 6).attr('y', ih - 6).attr('text-anchor', 'end').text(lang === 'zh' ? '南海诸岛' : 'South China Sea Islands');
      }
      hl.raise();
      enableZoom(zg, pins, s);
    });
  }

  // Macro-region view: Lambert azimuthal equal-area (the projection the EU uses for its statistics maps).
  function drawMacro(token) {
    return loadJSON('world').then(function (wt) {
      if (token !== renderToken) return;
      showSvg(true);
      var id = view.id, R = REG[id], M = MACRO[id];
      var land = topojson.feature(wt, wt.objects.land);
      var provs = topojson.feature(wt, wt.objects.provinces).features.filter(function (f) { return M.members[f.properties.cc]; });
      var list = filtered().filter(function (r) { return R.scope(r.geo.path); });
      var counts = countBy(list, function (r) { return r.geo.path[1]; });
      var s = size();
      var frame = { type: 'MultiPoint', coordinates: M.frame };
      var proj = d3.geoAzimuthalEqualArea().rotate(M.rotate).fitExtent([[10, 10], [s.w - 10, s.h - 10]], frame), path = d3.geoPath(proj);
      svg.attr('viewBox', '0 0 ' + s.w + ' ' + s.h).attr('aria-label', regionName(id));
      svg.selectAll('*').remove();
      var zg = svg.append('g').attr('class', 'rm-zoomg');
      zg.append('path').attr('class', 'rm-land').attr('d', path(land));
      var hl = null;
      zg.append('g').selectAll('path').data(provs).join('path')
        .attr('class', function (f) { return 'rm-prov' + (counts[f.properties.prov] ? ' has' : ''); })
        .attr('d', path)
        .style('fill', function (f) { return color(counts[f.properties.prov]); })
        .on('mousemove', function (e, f) {
          var cc = f.properties.cc, cn = list.filter(function (r) { return r.geo.path[0] === cc; }).length;
          showTip(e, '<b>' + esc(regionName(cc)) + '</b> · ' + nRaces(cn) + (featName(f.properties) !== regionName(cc) ? '<br>' + esc(featName(f.properties)) + ' · ' + nRaces(counts[f.properties.prov] || 0) : ''));
        })
        .on('mouseleave', hideTip)
        .on('click', function (e, f) { go(drillFromRegion(id, f.properties.cc)); });
      hl = zg.append('path').attr('class', 'rm-hl');
      // countries too small to click at this scale (Malta) get a pin
      var ccs = {}; list.forEach(function (r) { ccs[r.geo.path[0]] = 1; });
      var items = Object.keys(ccs).map(function (cc) {
        var fs = provs.filter(function (f) { return f.properties.cc === cc; });
        if (!fs.length) return null;
        var fc = { type: 'FeatureCollection', features: fs }, b = path.bounds(fc);
        if (Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) > 12) return null;
        return { fc: fc, cc: cc, x: (b[0][0] + b[1][0]) / 2, y: (b[0][1] + b[1][1]) / 2, r: 12, label: REG[cc].name.en };
      }).filter(Boolean);
      var pins = addPins(items,
        function (e, d) { hl.attr('d', path(d.fc)); showTip(e, '<b>' + esc(d.label) + '</b> · ' + nRaces(list.filter(function (r) { return r.geo.path[0] === d.cc; }).length)); },
        function () { hl.attr('d', null); hideTip(); },
        function (d) { go(drillFromRegion(id, d.cc)); });
      enableZoom(zg, pins, s);
    });
  }

  function cssVar(name, fb) { var v = getComputedStyle(root).getPropertyValue(name).trim(); return v || fb; }
  function drawStreet(token) {
    var R = REG[view.region], depth = view.trail.length, last = view.trail[depth - 1];
    var files = [STREET_FILE[view.trail[0]] || R.file];
    if (view.region === 'CN' && depth >= 2) files.push('districts-CN');
    return Promise.all(files.map(loadJSON)).then(function (topos) {
      if (token !== renderToken) return;
      showSvg(false);
      var units = topojson.feature(topos[0], topos[0].objects.units).features;
      units.forEach(function (f) { unitProps[f.properties.id] = f.properties; });
      var dists = topos[1] ? topojson.feature(topos[1], topos[1].objects.units).features : [];
      dists.forEach(function (f) { unitProps[f.properties.id] = f.properties; });
      // outline: the province at depth 1, the city (with its districts) at depth 2, the district at depth 3
      var outline, inner = [];
      if (depth === 1) {
        // province: merged outer edge (dashed) + its cities/districts as thin lines
        var t0 = topos[0], inProv = function (g) { return STREET_FILE[view.trail[0]] ? true : R.featDrill({ properties: g.properties }) === last; };
        inner = units.filter(function (f) { return inProv(f); });
        outline = [{ type: 'Feature', properties: {}, geometry: topojson.merge(t0, t0.objects.units.geometries.filter(inProv)) }];
      } else {
        outline = units.concat(dists).filter(function (f) { return f.properties.id === last; });
        if (depth === 2) inner = dists.filter(function (f) { return f.properties.parent === last; });
      }
      if (!lmap) {
        lmap = L.map(leafEl, { zoomControl: true, scrollWheelZoom: true, worldCopyJump: false });
        // OpenStreetMap standard tiles in both themes (no API key); dark mode darkens them with a CSS filter.
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, className: 'rm-tiles',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(lmap);
        lmarkers = L.layerGroup().addTo(lmap);
      }
      setTimeout(function () { lmap.invalidateSize(); }, 0);
      if (loutline) loutline.remove();
      var accent = cssVar('--rm-accent', '#256abf');
      loutline = L.featureGroup([
        L.geoJSON({ type: 'FeatureCollection', features: inner }, { style: { color: accent, weight: 0.8, opacity: 0.45, fillOpacity: 0 }, interactive: false }),
        L.geoJSON({ type: 'FeatureCollection', features: outline }, { style: { color: accent, weight: 1.6, opacity: 0.75, dashArray: '4 3', fillOpacity: 0 }, interactive: false })
      ]).addTo(lmap);
      updateMarkers();
      var b = L.latLngBounds([]);
      if (outline.length) b.extend(loutline.getBounds());
      Object.keys(markerById).forEach(function (id) { b.extend(markerById[id].getLatLng()); });
      lmarkers.eachLayer(function (m) { if (m.getLatLng) b.extend(m.getLatLng()); });
      if (b.isValid()) lmap.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
    });
  }
  // Points for single races; a numbered circle for any place below that holds more than CLUSTER_MAX races.
  function updateMarkers() {
    if (!lmarkers || view.level !== 'street') return;
    lmarkers.clearLayers(); markerById = {};
    var accent = cssVar('--rm-accent', '#256abf'), depth = view.trail.length;
    var list = filtered().filter(function (r) { return inScope(r, view); });
    var groups = {};
    list.forEach(function (r) { var k = raceKeys(r)[depth]; if (k) (groups[k] = groups[k] || []).push(r); });
    var clustered = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k]; if (g.length <= CLUSTER_MAX) return;
      g.forEach(function (r) { clustered[r.id] = 1; });
      var lat = d3.mean(g, function (r) { return r.lat; }), lng = d3.mean(g, function (r) { return r.lng; });
      var size = Math.round(28 + Math.min(16, g.length * 1.2));
      var name = keyName(k, depth);
      var m = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'rm-bubble', html: '<span>' + g.length + '</span>', iconSize: [size, size] }),
        keyboard: true, title: name + ' · ' + nRaces(g.length), riseOnHover: true
      });
      m.bindTooltip(esc(name) + ' · ' + nRaces(g.length) + '<br><small>' + esc(u('zoom_in')) + '</small>', { direction: 'top', offset: [0, -size / 2] });
      m.on('click', function () { go({ level: 'street', region: view.region, trail: view.trail.concat(k) }); });
      m.addTo(lmarkers);
    });
    list.forEach(function (r) {
      if (clustered[r.id]) return;
      var approx = !(r.loc_precision || '').match(/^(strava|manual)/);
      var m = L.circleMarker([r.lat, r.lng], {
        radius: 7, weight: 2, color: '#fff', fillColor: accent, fillOpacity: approx ? 0.45 : 0.95, dashArray: approx ? '2 2' : null
      });
      m.bindPopup('<div class="rm-pop" lang="' + (lang === 'zh' ? 'zh-Hans' : 'en') + '">' + cardHTML(r, true) + '</div>', { maxWidth: 280 });
      m.bindTooltip(esc(loc(r.name)), { direction: 'top', offset: [0, -6] });
      m.on('click', function () { setActive(r.id); var c = root.querySelector('.rm-card[data-id="' + r.id + '"]'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      m.addTo(lmarkers); markerById[r.id] = m;
    });
  }
  function focusRace(id) {
    var m = markerById[id]; if (!m || !lmap) return;
    setActive(id);
    lmap.setView(m.getLatLng(), Math.max(lmap.getZoom(), 13));
    m.openPopup();
  }

  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (view.level !== 'street') drawMap(); }, 200); });
  window.addEventListener('hashchange', function () { go(fromHash(), { noHash: true }); });

  // load world first so province names exist for crumbs on deep links
  loadJSON('world').then(function (w) {
    topojson.feature(w, w.objects.provinces).features.forEach(function (f) { provNames[f.properties.prov] = f.properties; });
    var v = fromHash();
    if (v.level === 'street' && v.region === 'TW') return loadJSON('units-TW').then(function (tw) {
      topojson.feature(tw, tw.objects.units).features.forEach(function (f) { unitProps[f.properties.id] = f.properties; if (TW_OUTLYING[f.properties.id]) provNames[f.properties.id] = f.properties; });
      go(v, { noHash: true });
    });
    go(v, { noHash: true });
  }).catch(function (e) { console.error(e); go({ level: 'world' }, { noHash: true }); });
})();
