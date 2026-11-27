// 공동구매 이미지 생성기
// 배경이 포함된 이미지 1장을 넣으면
//  1) 슬롯 A/B/C/D(UI에서 쓰는 4가지 사이즈)로 크롭·스케일해 컴포넌트 4개를 만들고
//  2) 템플릿 UI 화면(빅배너/공동구매/추천/상세)을 복사해, 기존 이미지 인스턴스를 새 컴포넌트로 교체해서
//     UI에 들어간 모습을 바로 보여준다.

// =====================================================================
// 설정: 여기 값만 고치면 슬롯/유형을 보정하거나 추가할 수 있다.
// 좌표는 모두 슬롯 컴포넌트 기준 px. safe = 오브젝트(제품)가 들어갈 안전 영역.
//  - safe(A/C): Figma "[운영]공동구매_배송상품_동원" 프레임(참치캔)에서 측정
//  - safe(D): 추정 (샘플로 보정 필요)
//  - guides: Sample 화면(이디야_팥붕어빵)의 UI 구조에서 측정한 "UI가 가리거나 잘라내는 영역"
// =====================================================================
const SLOTS = [
  {
    id: 'A', suffix: '1', name: '공동구매 카드/추천 카드', w: 390, h: 390, mode: 'fit',
    uses: '공동구매 Deal 카드(가로 29~361 노출), 추천 카드(가로 69~321 노출)',
    safe: { x: 75, y: 57, w: 240, h: 186 },
    guides: [
      { x: 0, y: 0, w: 69, h: 390, label: '추천 카드 좌측 잘림' },
      { x: 321, y: 0, w: 69, h: 390, label: '추천 카드 우측 잘림' },
      { x: 29, y: 0, w: 74, h: 69, label: '뱃지' },
      { x: 0, y: 203, w: 390, h: 17, label: '추천 텍스트 시작(y≥203)' },
      { x: 0, y: 220, w: 390, h: 170, label: '공동구매·추천 텍스트(y≥220)' },
    ],
  },
  {
    // mode 'white': 컴포넌트 배경을 흰색으로 채우고 제품을 safe 영역 가운데에 놓는다 (여백 28px)
    id: 'B', suffix: '2', name: '상세', w: 275, h: 275, mode: 'white',
    uses: '상세 페이지 썸네일 (흰 배경, 360으로 확대 표시)',
    safe: { x: 27.5, y: 27.5, w: 220, h: 220 }, // 정중앙 (여백 27.5px)
  },
  {
    id: 'C', suffix: '3', name: '오픈예정 카드', w: 162, h: 250, mode: 'fit',
    uses: '공동구매 화면 D-3 오픈예정 카드',
    safe: { x: 4, y: 70, w: 152, h: 117 },
    guides: [{ x: 0, y: 60, w: 162, h: 128, label: 'D-3 텍스트 영역' }],
  },
  {
    id: 'D', suffix: '_bigbanner', name: '빅배너', w: 720, h: 460, mode: 'fit',
    uses: '빅배너 UI (가운데 가로 180~540만 노출)',
    safe: { x: 210, y: 104, w: 300, h: 186 },
    guides: [
      { x: 0, y: 0, w: 180, h: 460, label: '화면 밖(좌)' },
      { x: 540, y: 0, w: 180, h: 460, label: '화면 밖(우)' },
      { x: 180, y: 0, w: 360, h: 94, label: '헤더' },
      { x: 180, y: 298, w: 360, h: 162, label: '타이틀/버튼 영역' },
    ],
  },
];

// 오브젝트 유형: 안전 영역 대비 배율. 바닥선은 고정하고 위/좌우로만 늘린다. (초기 추정값, 샘플로 보정)
const TYPES = {
  horizontal: { label: '가로형', wMul: 1.0, hMul: 1.0 },
  vertical: { label: '세로형', wMul: 1.0, hMul: 1.15 },
  square: { label: '정사각·봉지형', wMul: 0.85, hMul: 1.0 },
  bundle: { label: '묶음형', wMul: 1.05, hMul: 1.05 },
  card: { label: '카드형', wMul: 0.95, hMul: 0.95 },
};

const KEY_ROOT = 'masterRootId'
// 이 디자인 파일의 UI 템플릿 Sample (지정/자동 감지가 안 될 때 마지막으로 시도)
const DEFAULT_MASTER_IDS = ['2467:216970']; // 사용자가 직접 지정한 UI 템플릿 프레임(Sample)의 id

// =====================================================================
// 배치 계산 (순수 함수 — Node에서 테스트 가능)
// imgW/imgH: 원본 이미지 px, bbox: 원본 이미지 안의 오브젝트 영역 {x,y,w,h}
// 반환: 슬롯 컴포넌트 안에서 이미지가 놓일 위치/크기와 경고 목록
// =====================================================================
function round2(n) { return Math.round(n * 100) / 100; }

function typeBox(safe, type) {
  const t = TYPES[type] || TYPES.horizontal;
  const w = safe.w * t.wMul;
  const h = safe.h * t.hMul;
  return {
    x: safe.x + (safe.w - w) / 2,
    y: safe.y + safe.h - h, // 바닥선 고정
    w: w,
    h: h,
  };
}

// bgKind: 입력 이미지의 배경 종류 'alpha'(투명 PNG) | 'white'(흰 배경) | 'other'(배경 있음). 흰 배경 슬롯(B)에서만 쓴다.
function computePlacement(imgW, imgH, bbox, slot, type, bgKind) {
  const warnings = [];

  // 흰 배경 슬롯(B): 배경을 흰색으로, 제품을 안전 영역 가운데에 놓는다.
  //  - 'alpha': 이미지가 없는 곳은 흰색이 비치므로 오브젝트만 정확히 배치
  //  - 'white': 이미지 배경이 흰색이라 슬롯을 덮어야 이음새가 안 보인다 (덮기 제약 적용)
  //  - 그 외: 배경을 지울 수 없으므로 꽉 채우고 경고
  if (slot.mode === 'white') {
    if (bgKind !== 'alpha' && bgKind !== 'white') {
      const r = computePlacement(imgW, imgH, bbox, Object.assign({}, slot, { mode: 'cover' }), type);
      r.warnings.push('배경이 흰색이 아니라 ' + slot.name + '(' + slot.id + ')를 흰 배경으로 만들 수 없습니다. 투명 PNG나 흰 배경 이미지를 넣으세요');
      return r;
    }
    const sb = slot.safe;
    let s = Math.min(sb.w / bbox.w, sb.h / bbox.h);
    const cx = sb.x + sb.w / 2;
    const cy = sb.y + sb.h / 2;
    let x = cx - (bbox.x + bbox.w / 2) * s;
    let y = cy - (bbox.y + bbox.h / 2) * s;
    if (bgKind === 'white') {
      const coverScale = Math.max(slot.w / imgW, slot.h / imgH);
      if (coverScale > s) {
        warnings.push('슬롯을 덮으려면 오브젝트가 안전 영역보다 ' + Math.round((coverScale / s - 1) * 100) + '% 커집니다 (원본 여백 부족)');
        s = coverScale;
        x = cx - (bbox.x + bbox.w / 2) * s;
        y = cy - (bbox.y + bbox.h / 2) * s;
      }
      const clx = Math.min(0, Math.max(slot.w - imgW * s, x));
      const cly = Math.min(0, Math.max(slot.h - imgH * s, y));
      if (Math.abs(clx - x) > 0.5 || Math.abs(cly - y) > 0.5) {
        warnings.push('원본 여백이 부족해 제품이 가운데에서 가로 ' + round2(clx - x) + 'px, 세로 ' + round2(cly - y) + 'px 어긋납니다');
      }
      x = clx;
      y = cly;
    }
    return {
      x: round2(x), y: round2(y), w: round2(imgW * s), h: round2(imgH * s), scale: s,
      objectBox: { x: round2(x + bbox.x * s), y: round2(y + bbox.y * s), w: round2(bbox.w * s), h: round2(bbox.h * s) },
      warnings: warnings,
    };
  }

  // 보정 없음: 슬롯을 꽉 채우고 가운데 크롭
  if (slot.mode === 'cover') {
    const s = Math.max(slot.w / imgW, slot.h / imgH);
    return {
      x: round2((slot.w - imgW * s) / 2),
      y: round2((slot.h - imgH * s) / 2),
      w: round2(imgW * s),
      h: round2(imgH * s),
      scale: s,
      warnings: warnings,
    };
  }

  const box = typeBox(slot.safe, type);
  const fitScale = Math.min(box.w / bbox.w, box.h / bbox.h);
  const coverScale = Math.max(slot.w / imgW, slot.h / imgH);

  let s = fitScale;
  if (coverScale > fitScale) {
    s = coverScale; // 슬롯이 이미지로 다 덮이도록 키운다
    const over = Math.round((coverScale / fitScale - 1) * 100);
    warnings.push('슬롯을 덮으려면 오브젝트가 안전 영역보다 ' + over + '% 커집니다 (원본 여백 부족)');
  }

  // 이상적 위치: 안전 영역 가로 중앙, 바닥선에 오브젝트 하단을 맞춤
  const targetCx = box.x + box.w / 2;
  const targetBottom = box.y + box.h;
  let x = targetCx - (bbox.x + bbox.w / 2) * s;
  let y = targetBottom - (bbox.y + bbox.h) * s;

  // 이미지가 슬롯 밖으로 비지 않도록 클램프
  const minX = slot.w - imgW * s;
  const minY = slot.h - imgH * s;
  const cx = Math.min(0, Math.max(minX, x));
  const cy = Math.min(0, Math.max(minY, y));
  const dx = cx - x;
  const dy = cy - y;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    const parts = [];
    if (Math.abs(dx) > 0.5) parts.push('가로 ' + Math.abs(round2(dx)) + 'px ' + (dx < 0 ? '왼쪽' : '오른쪽'));
    if (Math.abs(dy) > 0.5) parts.push('세로 ' + Math.abs(round2(dy)) + 'px ' + (dy < 0 ? '위' : '아래'));
    warnings.push('원본 여백이 부족해 오브젝트가 목표 위치보다 ' + parts.join(', ') + '로 어긋납니다');
  }
  x = cx;
  y = cy;

  // 최종 오브젝트 위치가 UI가 덮는 영역(안전 영역 아래)을 침범하는지 확인
  const ob = { x: x + bbox.x * s, y: y + bbox.y * s, w: bbox.w * s, h: bbox.h * s };
  const safeBottom = slot.safe.y + slot.safe.h;
  if (ob.y + ob.h > safeBottom + 1) {
    warnings.push('오브젝트 하단이 안전 영역보다 ' + round2(ob.y + ob.h - safeBottom) + 'px 아래라 UI 텍스트에 가려질 수 있습니다');
  }
  if (ob.x < -0.5 || ob.x + ob.w > slot.w + 0.5 || ob.y < -0.5) {
    warnings.push('오브젝트가 슬롯 밖으로 잘립니다');
  }

  return {
    x: round2(x), y: round2(y), w: round2(imgW * s), h: round2(imgH * s),
    scale: s, objectBox: { x: round2(ob.x), y: round2(ob.y), w: round2(ob.w), h: round2(ob.h) },
    warnings: warnings,
  };
}

// =====================================================================
// 템플릿 찾기: "템플릿 컴포넌트(텍스트 없는 슬롯 크기 컴포넌트) + UI 화면(가로 360 프레임)"이
// 같이 들어 있는 프레임(Sample = 마스터 템플릿).
// 우선순위: 사용자가 지정한 프레임 > 현재 페이지 자동 탐색(화면이 가장 많은 단 하나일 때만)
// ※ 이미지를 가져오려고 선택한 레이어에서는 템플릿을 추정하지 않는다 (제품별 Sample이 많아 잘못 잡힘)
// =====================================================================
function slotBySize(w, h) {
  return SLOTS.find(function (s) { return Math.round(s.w) === Math.round(w) && Math.round(s.h) === Math.round(h); });
}

function isTemplateComp(c) {
  if (c.type !== 'COMPONENT') return false;
  if (!slotBySize(c.width, c.height)) return false;
  return c.findAll(function (n) { return n.type === 'TEXT'; }).length === 0; // 텍스트가 있으면 이미지 컴포넌트가 아님
}

// root 안의 템플릿 컴포넌트(슬롯별 첫 번째)와 UI 화면을 읽는다. 둘 다 있어야 유효.
function scanRoot(root) {
  // 페이지 자체는 후보가 아니다: 이전에 만든 결과물(컴포넌트/미리보기)이 페이지에 놓여 있어서 템플릿으로 오인될 수 있다
  if (!root || root.type === 'PAGE' || !('findChildren' in root)) return null;
  const templates = {};
  const dup = [];
  root.findChildren(isTemplateComp).forEach(function (c) {
    const s = slotBySize(c.width, c.height);
    if (templates[s.id]) dup.push(c.name); else templates[s.id] = c;
  });
  const screens = root.findChildren(function (n) { return n.type === 'FRAME' && Math.round(n.width) === 360; });
  if (!Object.keys(templates).length || !screens.length) return null;
  return { root: root, templates: templates, screens: screens, dup: dup };
}

// 선택한 노드에서 위로 올라가며 처음 만나는 유효한 템플릿 프레임 (사용자가 버튼으로 지정할 때만 사용)
function rootFromNode(node) {
  let cur = node;
  while (cur && cur.type !== 'PAGE') {
    const r = scanRoot(cur);
    if (r) return r;
    cur = cur.parent;
  }
  return null;
}

function findRootsOnPage(page) {
  const comps = (page || figma.currentPage).findAllWithCriteria({ types: ['COMPONENT'] }).filter(isTemplateComp);
  const parents = [];
  comps.forEach(function (c) { if (c.parent && parents.indexOf(c.parent) < 0) parents.push(c.parent); });
  return parents.map(scanRoot).filter(function (r) { return r; });
}

// UI 화면이 가장 많은 프레임을 고른다(전체 UI 세트 = 마스터). 같은 점수가 둘 이상이면 모호하므로 고르지 않는다.
function pickBest(roots) {
  if (!roots.length) return { best: null, ambiguous: false };
  const score = function (r) { return r.screens.length * 10 + Object.keys(r.templates).length; };
  const top = Math.max.apply(null, roots.map(score));
  const tops = roots.filter(function (r) { return score(r) === top; });
  if (tops.length === 1) return { best: tops[0], ambiguous: false };
  return { best: null, ambiguous: true, count: tops.length };
}

function setupFromSample() {
  const sel = figma.currentPage.selection;
  if (sel.length < 1) return '템플릿 컴포넌트와 UI 화면(공동구매/추천/상세/빅배너)이 모두 들어 있는 Sample 프레임을 선택하세요';
  const r = rootFromNode(sel[0]);
  if (!r) return '선택한 곳에서 템플릿 컴포넌트(390², 275², 162×250, 720×460, 텍스트 없음)와 UI 화면(가로 360 프레임)을 같이 찾지 못했습니다';
  figma.root.setPluginData(KEY_ROOT, r.root.id);
  const missing = SLOTS.filter(function (s) { return !r.templates[s.id]; }).map(function (s) { return s.id; });
  let text = '설정 완료: "' + r.root.name + '" — 템플릿 컴포넌트 ' + Object.keys(r.templates).length + '개, UI 화면 ' + r.screens.length + '개';
  if (missing.length) text += ' (슬롯 ' + missing.join(',') + ' 템플릿 없음)';
  if (r.dup.length) text += ' (같은 크기가 여러 개라 첫 번째만 사용: ' + r.dup.join(', ') + ')';
  if (r.screens.length < 3) text += ' ※ UI 화면이 ' + r.screens.length + '개뿐입니다. 공동구매/추천/상세/빅배너가 모두 있는 Sample인지 확인하세요';
  return text;
}

function setupUsable(r) {
  return !!(r && r.root && r.screens.length > 0 && SLOTS.some(function (s) { return r.templates[s.id]; }));
}

// 반환: { root, templates:{slotId: node}, screens:[node], dup, source: 'saved' | 'auto' | 'ambiguous' | 'none', ambiguousCount }
async function resolveSetup() {
  let savedPartial = null;
  const id = figma.root.getPluginData(KEY_ROOT);
  if (id) {
    const n = await figma.getNodeByIdAsync(id);
    const r = n ? scanRoot(n) : null;
    if (r && r.screens.length >= 3) { r.source = 'saved'; return r; }
    if (r) savedPartial = r; // UI 화면이 3개 미만(예: 빅배너만 있는 제품별 Sample)이면 더 완전한 템플릿이 있는지 먼저 본다
  }
  const diag = { file: (figma.root && figma.root.name) || '', pages: 0, comps: 0, defaultFound: false };
  for (const did of DEFAULT_MASTER_IDS) {
    try {
      const dn = await figma.getNodeByIdAsync(did);
      const dr = dn ? scanRoot(dn) : null;
      if (dn) diag.defaultFound = true;
      if (dr && dr.screens.length >= 3) { dr.source = 'default'; return dr; }
    } catch (e) {}
  }
  let found = pickBest(findRootsOnPage());
  if ((!found.best && !found.ambiguous) || (found.best && found.best.screens.length < 3)) {
    const partial = found.best; // 현재 페이지에서는 UI 화면이 3개 미만인 것만 잡힘
    found = partial ? { best: partial, ambiguous: false } : found;
    // 현재 페이지에 완전한 마스터가 없으면 다른 페이지에서 완전한 마스터(UI 화면 3개 이상)를 찾는다
    const pages = (figma.root && figma.root.children) || [];
    for (const pg of pages) {
      if (pg === figma.currentPage) continue;
      try {
        await pg.loadAsync();
        diag.pages++;
        const f = pickBest(findRootsOnPage(pg));
        if (f.best && f.best.screens.length >= 3) { found = f; break; }
      } catch (e) {}
    }
  }
  if (found.best) {
    found.best.source = 'auto';
    // UI 화면이 3개 이상 있는 완전한 마스터가 하나로 정해지면 기억해 둔다 → 다른 페이지에서 실행해도 미리보기가 나온다
    if (found.best.screens.length >= 3) { try { figma.root.setPluginData(KEY_ROOT, found.best.root.id); } catch (e) {} }
    return found.best;
  }
  if (savedPartial) { savedPartial.source = 'saved'; return savedPartial; }
  return { root: null, templates: {}, screens: [], dup: [], source: found.ambiguous ? 'ambiguous' : 'none', ambiguousCount: found.count || 0, diag: diag };
}

function postSetupStatus(r) {
  const names = {};
  SLOTS.forEach(function (s) { names[s.id] = r.templates[s.id] ? r.templates[s.id].name : null; });
  figma.ui.postMessage({
    type: 'setup-status', source: r.source, ambiguousCount: r.ambiguousCount || 0,
    rootName: r.root ? r.root.name : null, rootId: r.root ? r.root.id : null,
    templates: names, screens: r.screens.map(function (n) { return n.name; }),
  });
}

// =====================================================================
// Figma 노드 생성
// =====================================================================
function addGuides(comp, slot) {
  const rects = [];
  function mk(name, g, paint, stroke) {
    const r = figma.createRectangle();
    r.name = name;
    r.resize(g.w, g.h);
    figma.currentPage.appendChild(r);
    r.x = comp.x + g.x;
    r.y = comp.y + g.y;
    if (stroke) {
      r.fills = [];
      r.strokes = [{ type: 'SOLID', color: { r: 0.1, g: 0.8, b: 0.3 } }];
      r.strokeWeight = 1;
    } else {
      r.fills = [paint];
    }
    rects.push(r);
  }
  mk('_guide_안전영역', slot.safe, null, true);
  (slot.guides || []).forEach(function (g) {
    mk('_guide_' + g.label, g, { type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 }, opacity: 0.18 }, false);
  });
  const group = figma.group(rects, figma.currentPage);
  group.name = '_guides · ' + comp.name; // 컴포넌트 밖에 있으므로 UI 미리보기에는 나오지 않는다
  group.setPluginData('guideFor', comp.id); // 짝 컴포넌트가 지워지면 고아 가이드로 정리
  group.locked = true;
  return group;
}

// 가이드 그룹 삭제. onlyOrphans=true면 짝 컴포넌트가 사라진 것(또는 짝 정보가 없는 옛 가이드)만 지운다.
async function clearGuides(onlyOrphans) {
  const groups = figma.currentPage.children.filter(function (n) { return n.type === 'GROUP' && n.name.indexOf('_guides') === 0; });
  let count = 0;
  for (const g of groups) {
    if (onlyOrphans) {
      const id = g.getPluginData('guideFor');
      const comp = id ? await figma.getNodeByIdAsync(id) : null;
      if (comp) continue;
    }
    g.remove(); // 잠겨 있어도 API로는 삭제 가능
    count++;
  }
  return count;
}

// ---- 카드 그라데이션 (gonggu-gradient 플러그인에서 가져옴) ----
const CARD_W = 332, CARD_H = 390; // 공동구매 Deal 카드 (A 390 컴포넌트의 가로 29~361 구간)
function gradPaint(color) {
  const r = color[0] / 255, g = color[1] / 255, b = color[2] / 255;
  const stops = [[0, 1], [0.2256, 1], [0.3103, 0.85], [0.3949, 0.5], [0.4795, 0.15], [0.5641, 0]];
  return {
    type: 'GRADIENT_LINEAR',
    gradientTransform: [[0, -1, 1], [1, 0, 0]],
    gradientStops: stops.map(function (s) { return { position: s[0], color: { r: r, g: g, b: b, a: s[1] } }; })
  };
}
function setOverlay(frame, color) {
  let overlay = frame.children.find(function (n) { return n.name === '__gradient_overlay__'; });
  if (!overlay) {
    overlay = figma.createRectangle();
    overlay.name = '__gradient_overlay__';
    overlay.resize(frame.width, frame.height);
    frame.appendChild(overlay);
    overlay.x = 0; overlay.y = 0;
    overlay.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  }
  overlay.fills = [gradPaint(color)];
  frame.appendChild(overlay); // 항상 맨 위
}
// 컴포넌트/이미지 레이어로 332×390 카드 프레임을 만든다 (그라데이션은 setOverlay로 따로)
function makeCard(src, x, y) {
  const card = figma.createFrame();
  card.name = src.name + ' · 카드';
  card.resize(CARD_W, CARD_H);
  card.cornerRadius = 16;
  card.clipsContent = true;
  card.fills = [];
  card.x = x; card.y = y;
  const inst = src.type === 'COMPONENT' ? src.createInstance() : src.clone();
  card.appendChild(inst);
  if (Math.abs(inst.height - CARD_H) > 0.5) inst.rescale(CARD_H / inst.height);
  inst.x = Math.round((CARD_W - inst.width) / 2);
  inst.y = 0;
  return card;
}

function buildComponent(slot, p, image, name, x, y) {
  const comp = figma.createComponent();
  comp.name = name + slot.suffix;
  comp.resize(slot.w, slot.h);
  comp.x = x;
  comp.y = y;
  comp.clipsContent = true;
  comp.fills = slot.mode === 'white' ? [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] : [];

  const rect = figma.createRectangle();
  rect.name = 'image';
  rect.resize(p.w, p.h);
  comp.appendChild(rect);
  rect.x = p.x;
  rect.y = p.y;
  rect.constraints = { horizontal: 'SCALE', vertical: 'SCALE' }; // UI에서 인스턴스를 키우거나 줄여도 같이 스케일
  rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];

  return comp;
}

// 템플릿 UI 화면을 복사하고, 템플릿 컴포넌트의 인스턴스를 새 컴포넌트로 교체
async function buildPreview(name, comps, templates, screens, x0, y0) {
  const idToSlot = {};
  Object.keys(templates).forEach(function (k) { if (templates[k]) idToSlot[templates[k].id] = k; });
  const frames = [];
  const notes = [];
  let x = x0;
  let maxH = 0;
  for (const sc of screens) {
    const c = sc.clone();
    c.name = name + ' · ' + sc.name;
    figma.currentPage.appendChild(c);
    c.x = x;
    c.y = y0;
    const insts = c.findAll(function (n) { return n.type === 'INSTANCE'; });
    let swapped = 0;
    for (const inst of insts) {
      const main = await inst.getMainComponentAsync();
      const sid = main ? idToSlot[main.id] : null;
      if (sid && comps[sid]) {
        inst.swapComponent(comps[sid]);
        inst.name = comps[sid].name;
        swapped++;
      }
    }
    notes.push({ screen: sc.name, swapped: swapped });
    frames.push(c);
    x += c.width + 40;
    maxH = Math.max(maxH, c.height);
  }
  return { frames: frames, notes: notes, height: maxH };
}

// =====================================================================
// Figma 플러그인 본체
// =====================================================================
async function handle(msg) {
  if (msg.type === 'clear-guides') {
    const n = await clearGuides(false);
    figma.ui.postMessage({ type: 'toast', text: n ? '가이드 ' + n + '개를 지웠습니다' : '지울 가이드가 없습니다 (현재 페이지)' });
    return;
  }

  if (msg.type === 'show-template') {
    const r = await resolveSetup();
    if (!r.root) {
      figma.ui.postMessage({ type: 'toast', text: '지정된 템플릿 프레임이 없습니다' });
      return;
    }
    figma.currentPage.selection = [r.root];
    figma.viewport.scrollAndZoomIntoView([r.root]);
    return;
  }

  if (msg.type === 'setup-sample') {
    figma.ui.postMessage({ type: 'toast', text: setupFromSample() });
    postSetupStatus(await resolveSetup());
    return;
  }

  if (msg.type === 'import-selection') {
    const sel = figma.currentPage.selection.slice(0, 20);
    if (!sel.length) {
      figma.ui.postMessage({ type: 'toast', text: 'Figma에서 이미지를 먼저 선택하세요' });
      return;
    }
    for (const node of sel) {
      if (!('exportAsync' in node)) continue;
      const scale = node.width > 1500 ? 1 : 2;
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
      figma.ui.postMessage({ type: 'imported', name: node.name, bytes: bytes });
    }
    return;
  }

  if (msg.type === 'export-selection') {
    const sel = figma.currentPage.selection;
    if (!sel.length) { figma.ui.postMessage({ type: 'error', message: '이미지(컴포넌트/프레임)를 선택하세요.' }); return; }
    const n = sel[0];
    figma.ui.postMessage({ type: 'export-image', name: n.name, bytes: await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }) });
    return;
  }
  if (msg.type === 'apply-gradient') {
    let target = msg.targetId ? await figma.getNodeByIdAsync(msg.targetId) : null;
    if (!target) {
      const sel = figma.currentPage.selection;
      if (!sel.length) { figma.ui.postMessage({ type: 'error', message: '프레임이나 이미지를 선택하세요.' }); return; }
      const n = sel[0];
      const isCard = n.type === 'FRAME' && n.children && (n.name.indexOf('카드') >= 0 || n.children.some(function (k) { return k.name === '__gradient_overlay__'; }));
      if (isCard) target = n;
      else {
        target = makeCard(n, n.x + n.width + 40, n.y);
        figma.currentPage.selection = [target];
      }
    }
    setOverlay(target, msg.color);
    figma.ui.postMessage({ type: 'gradient-applied', targetId: target.id, name: target.name });
    return;
  }
  if (msg.type === 'generate') {
    await clearGuides(true); // 이전에 만든 결과물을 지우고 남은 가이드 정리
    const setup = await resolveSetup();
    postSetupStatus(setup);
    const doPreview = !!msg.preview && setupUsable(setup);
    if (msg.preview && !doPreview) {
      const why = setup.source === 'ambiguous'
        ? '템플릿 후보가 ' + setup.ambiguousCount + '개라 자동으로 고르지 못했습니다'
        : '이 파일(' + ((setup.diag && setup.diag.file) || '?') + ')의 모든 페이지(' + (((setup.diag && setup.diag.pages) || 0) + 1) + '개)에서 템플릿 컴포넌트(390²/275²/162×250/720×460, 텍스트 없음)와 UI 화면(가로 360 프레임)이 같이 들어 있는 프레임을 찾지 못했습니다. 템플릿이 들어 있는 Sample 프레임을 이 파일로 복사해 오세요';
      figma.ui.postMessage({
        type: 'toast',
        text: 'UI 미리보기를 만들지 못했습니다: ' + why + '. UI 화면(공동구매/추천/상세/빅배너)이 모두 있는 Sample 프레임을 선택하고 ' +
          '"이 Sample을 UI 템플릿으로 지정"을 누른 뒤 다시 생성하세요. (지금은 컴포넌트만 만듭니다)',
      });
    } else if (doPreview && setup.screens.length < 3) {
      figma.ui.postMessage({
        type: 'toast',
        text: '주의: 쓰고 있는 템플릿 "' + setup.root.name + '"에는 UI 화면이 ' + setup.screens.length + '개(' +
          setup.screens.map(function (n) { return n.name; }).join(', ') + ')뿐입니다. 공동구매/추천/상세/빅배너가 모두 있는 Sample을 지정하면 전체 화면이 나옵니다.',
      });
    }

    const center = figma.viewport.center;
    const startX = Math.round(center.x - 400);
    let rowY = Math.round(center.y - 200);
    const created = [];
    const results = [];
    const previews = [];
    const cards = [];

    for (const it of msg.items) {
      const image = figma.createImage(it.bytes);
      const baseName = String(it.name || 'image').normalize('NFC').replace(/[\s_\-]*(big[\s_\-]*banner|빅배너)[\s_\-]*/ig, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'image';
      const imageB = it.bytesB ? figma.createImage(it.bytesB) : null;
      const comps = {};
      let x = startX;
      for (const slot of SLOTS) {
        const useB = slot.mode === 'white' && imageB;
        const p = computePlacement(it.w, it.h, it.bbox, slot, it.objType, useB ? 'alpha' : it.bgKind);
        const comp = buildComponent(slot, p, useB ? imageB : image, baseName, x, rowY);
        if (msg.guides && slot.safe) created.push(addGuides(comp, slot));
        comps[slot.id] = comp;
        created.push(comp);
        results.push({ name: comp.name, slot: slot.id, warnings: p.warnings });
        x += slot.w + 40;
      }
      rowY += 460 + 80;

      if (doPreview) {
        const pv = await buildPreview(baseName, comps, setup.templates, setup.screens, startX, rowY);
        pv.frames.forEach(function (f) { created.push(f); });
        pv.notes.forEach(function (n) { previews.push({ name: baseName + ' · ' + n.screen, swapped: n.swapped }); });
        rowY += pv.height + 80;
      }
      if (msg.card && comps.A) {
        try {
          const card = makeCard(comps.A, startX + 390 + 40, rowY);
          created.push(card);
          cards.push({ id: card.id, name: card.name, bytes: await comps.A.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }) });
          rowY += CARD_H + 80;
        } catch (e) {
          results.push({ name: baseName + ' · 카드', slot: 'card', warnings: ['카드 시안을 만들지 못했습니다: ' + (e && e.message)] });
        }
      }
      rowY += 100;
    }

    figma.currentPage.selection = created.filter(function (n) { return n.name.indexOf('_guides') !== 0; });
    figma.viewport.scrollAndZoomIntoView(created);
    figma.ui.postMessage({ type: 'done', results: results, previews: previews, previewRequested: !!msg.preview, previewDone: doPreview, cards: cards });
  }
}

if (typeof figma !== 'undefined') {
  figma.showUI(__html__, { width: 420, height: 800 });

  figma.ui.postMessage({
    type: 'config',
    types: Object.keys(TYPES).map(function (k) { return { id: k, label: TYPES[k].label }; }),
    slots: SLOTS.map(function (s) { return { id: s.id, name: s.name, w: s.w, h: s.h, uses: s.uses, suffix: s.suffix }; }),
  });
  clearGuides(true).then(function (n) {
    if (n) figma.ui.postMessage({ type: 'toast', text: '남아 있던 가이드 ' + n + '개를 정리했습니다' });
  }).catch(function () {});
  resolveSetup().then(postSetupStatus).catch(function (e) {
    figma.ui.postMessage({ type: 'error', text: '템플릿 확인 중 오류: ' + String(e && e.message || e) });
  });

  figma.ui.onmessage = async function (msg) {
    try {
      await handle(msg);
    } catch (e) {
      figma.ui.postMessage({ type: 'error', text: '오류: ' + String(e && e.message || e) });
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { SLOTS, TYPES, computePlacement, typeBox };
}
