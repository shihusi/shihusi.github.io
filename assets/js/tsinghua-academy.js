// Original IIIS Qinghua Xuetang vertices, stored as little-endian Float32 XYZ:
// https://iiis.tsinghua.edu.cn/model/qhxt.json (reference view: /#page3).
(async () => {
  const canvas = document.querySelector(".academy-cloud");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let progress = 0, target = 0, frame = 0, last = 0;
  let hovered = null, focused = null, tapped = null;
  let campus = 0, campusTarget = 0;
  const points = [];
  const stage = canvas.parentElement;
  const drawOrder = [];
  let visibleCount = 0, academyCount = 0;
  const institutionCount = 7200;
  let xmuCount = 0;
  function updateDensity() {
    // CSS pixels measure the displayed footprint independently of Retina scaling.
    // Keep fine lettering recognizable at small sizes and use the full asset at 720px.
    const area = stage.clientWidth * stage.clientHeight;
    visibleCount = Math.min(drawOrder.length, institutionCount, Math.max(1400, Math.round(area / 40)));
    academyCount = Math.min(points.length, Math.max(5000, Math.round(area / 10)));
  }
  const models = new Map();
  let selected = "", requested = "", leaveTimer;
  let morph = 1;

  // Sample the existing transparent artwork, through the full depth of each opaque stroke.
  async function logoModel(img, count) {
    await img.decode();
    const surface = document.createElement("canvas");
    const w = surface.width = img.naturalWidth, h = surface.height = img.naturalHeight;
    const brush = surface.getContext("2d");
    brush.drawImage(img, 0, 0);
    const rgba = brush.getImageData(0, 0, w, h).data;
    const pixels = [], edges = [];
    const solid = i => rgba[4*i+3] > 90 && Math.min(...rgba.subarray(4*i, 4*i+3)) < 222;
    let left = w, right = 0, top = h, bottom = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = y*w+x;
      if (!solid(n)) continue;
      pixels.push(n);
      if (!x || !y || x === w-1 || y === h-1 || !solid(n-1) || !solid(n+1) || !solid(n-w) || !solid(n+w)) edges.push(n);
      left = Math.min(left,x); right = Math.max(right,x);
      top = Math.min(top,y); bottom = Math.max(bottom,y);
    }
    if (!pixels.length) return;
    const scale = Math.min(.84/(right-left+1), .74/(1.8*(bottom-top+1)));
    const data = new Uint16Array(count*4);
    const thickness = Math.min(.045, (bottom - top + 1) * scale * .17);
    const lanes = 10;
    for (let i = 0; i < count; i++) {
      const layer = i % lanes;
      const side = layer >= 7 && edges.length;
      const pool = side ? edges : pixels;
      // Cover the full mask on each depth layer, including narrow strokes.
      const laneCount = Math.ceil((count - layer) / lanes);
      const fraction = (Math.floor(i / lanes) + Math.random()) / laneCount;
      const n = pool[Math.floor(fraction * pool.length)];
      const x = (n%w-(left+right)/2+Math.random()-.5)*scale;
      const y = (Math.floor(n/w)-(top+bottom)/2+Math.random()-.5)*scale*1.8;
      // Four front samples, one back, two interior and three perimeter samples.
      let depth = Math.random();
      let ink = side ? 29500 : 13000;
      if (layer < 4) {
        depth = 1;
        ink = 53000;
      } else if (layer === 4) {
        depth = 0;
        ink = 20000;
      }
      const z = (depth - .5) * thickness;
      data.set([(x+.5)*65535,(y+.5)*65535,(z+.5)*65535, ink],i*4);
    }
    return data;
  }

  function selectModel(key) {
    const direct = selected && key && selected !== key && campus > 0;
    const priorBlend = morph * morph * (3 - 2 * morph);
    selected = key;
    const model = models.get(key);
    if (!model) return;
    points.forEach(p => {
      const i = key === "xmu" ? p.xmuIndex : key === "sqz" ? p.rank % towerCount : p.modelIndex;
      if (direct) {
        p.fromX = morph === 1 ? p.qx : p.fromX + (p.qx - p.fromX) * priorBlend;
        p.fromY = morph === 1 ? p.qy : p.fromY + (p.qy - p.fromY) * priorBlend;
        p.fromZ = morph === 1 ? p.qz : p.fromZ + (p.qz - p.fromZ) * priorBlend;
      }
      p.qx = model[4*i]/65535-.5;
      p.qy = model[4*i+1]/65535-.5;
      p.qz = model[4*i+2]/65535-.5;
      p.ink = model[4*i+3]/65535;
    });
    morph = direct ? 0 : 1;
  }
  const rain = document.querySelector(".glyph-rain");
  const sample = document.createElement("canvas");
  let strokes = [];
  const sampler = sample.getContext("2d", {willReadFrequently: true});
  let bounds, maskedProgress = -1;

  // Start the gathering on letter strokes currently visible behind the building.
  function sampleRain() {
    if (!sampler || !rain.clientWidth || !rain.clientHeight) return;
    const scaleX = rain.width / rain.clientWidth, scaleY = rain.height / rain.clientHeight;
    sample.width = Math.ceil(width);
    sample.height = Math.ceil(height);
    sampler.drawImage(rain, bounds.left * scaleX, bounds.top * scaleY,
      width * scaleX, height * scaleY, 0, 0, sample.width, sample.height);
    const rgba = sampler.getImageData(0, 0, sample.width, sample.height).data;
    strokes = [];
    for (let y = 0; y < sample.height; y += 3) {
      for (let x = 0; x < sample.width; x += 3) {
        let ink = 0;
        for (let j = y; j < Math.min(y + 3, sample.height); j++) {
          for (let i = x; i < Math.min(x + 3, sample.width); i++)
            ink += rgba[(j * sample.width + i) * 4 + 3];
        }
        if (ink > 20) strokes.push({x, y});
      }
    }
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      point.tile = null;
      if (!strokes.length) continue;
      const tile = strokes[Math.floor(i * strokes.length / points.length)];
      point.sx = (tile.x + 1.5) / width;
      point.sy = (tile.y + 1.5) / height;
      if (!i || tile !== strokes[Math.floor((i - 1) * strokes.length / points.length)])
        point.tile = tile;
    }
  }
  let width, height, rotationTime = 4000;
  // Projection bounds of the original model, in camera-distance units.
  const left = -.162507, span = .389509, midY = .004079;
  const allowOverlap = matchMedia("(max-width: 720px), (hover: none) and (pointer: coarse) and (max-height: 500px)");
  let clearings = [];
  function measureText() {
    if (allowOverlap.matches) {
      clearings = [];
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const about = document.querySelector(".about");
    const walker = document.createTreeWalker(about, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const rects = [...about.querySelectorAll("img")].map(img => img.getBoundingClientRect());
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      range.selectNodeContents(walker.currentNode);
      rects.push(...range.getClientRects());
    }
    clearings = rects.filter(r => r.bottom + 8 > bounds.top && r.top - 8 < bounds.bottom &&
      r.left - 12 < bounds.right && r.right + 12 > bounds.left).map(r =>
      [r.left - bounds.left - 12, r.top - bounds.top - 8, r.width + 24, r.height + 16]);
  }
  // Store the front surface at several poses so rear cornices disappear behind the facade.
  let towerMasks, towerCount = 0;
  const towerFront = Math.PI + .34, towerPoseSteps = 32;
  // The deeper wing opens to the viewer's right as the azimuth decreases.
  const towerYawAt = fraction => towerFront - 1.12 + 1.42 * fraction;
  function towerVisibility(model) {
    const grid = 96, count = model.length / 4;
    return Array.from({length: towerPoseSteps + 1}, (_, pose) => {
      const yaw = towerYawAt(pose / towerPoseSteps);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const front = new Float32Array(grid * (grid + 24)).fill(-1);
      const cells = new Uint16Array(count), depths = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const x = model[4*i]/65535-.5, y = model[4*i+1]/65535-.5, z = model[4*i+2]/65535-.5;
        const d = z*c-x*s, scale = 1/(1-.36*d);
        const col = Math.floor((.5+(x*c+z*s)*scale)*grid);
        const row = Math.floor((.51+(y+.32*d)*scale+.1)*grid);
        const cell = row*grid+col;
        cells[i] = cell;
        depths[i] = d;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = cell + dy*grid + dx;
            front[j] = Math.max(front[j], d);
          }
      }
      return depths.map((d,i) => Math.max(0, Math.min(1, 1-(front[cells[i]]-d-.022)/.036)));
    });
  }
  function paint() {
    if (progress !== maskedProgress && points.length) {
      maskedProgress = progress;
      rain.classList.toggle("gathering-academy", progress > 0);
      rain.style.setProperty("--rain-core", String(1 - .98 * Math.min(1, progress * 8)));
    }
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    const phase = 1 - Math.abs(rotationTime / 8000 - 1);
    const ease = phase < .5 ? 2 * phase ** 2 : 1 - 2 * (1 - phase) ** 2;
    const angle = .1 * (2 * ease - 1);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const towerVisible = selected === "sqz";
    const isLogo = selected && selected !== "xmu" && !towerVisible;
    const domeVisible = selected === "xmu";
    // Frame the atrium above the footer, including the nearest balcony rim.
    const enlargeTower = towerVisible && !allowOverlap.matches;
    const modelZoom = enlargeTower ? 1.55 : domeVisible ? 1.18 : 1;
    const centerX = enlargeTower ? .44 : .5;
    // Grow the desktop tower upward so its sweeping podium stays above the footer.
    const centerY = domeVisible ? .24 : enlargeTower ? .21 : .51;
    const yaw = towerVisible ? towerYawAt(ease) : domeVisible ? angle * .85 : isLogo ? .23 + .57 * Math.sin(rotationTime * Math.PI / 8000) : .29 + angle * 1.55;
    const shape = morph * morph * (3 - 2 * morph);
    const qc = Math.cos(yaw), qs = Math.sin(yaw);
    const pose = ease * towerPoseSteps;
    let targetCount = visibleCount;
    if (selected === "xmu") targetCount = Math.min(xmuCount, visibleCount * 2);
    if (enlargeTower) targetCount = Math.min(towerCount, Math.round(visibleCount * modelZoom ** 2));
    const count = Math.round(academyCount + (targetCount - academyCount) * campus);
    for (let index = 0; index < count; index++) {
      const p = points[drawOrder[index]];
      const t = Math.min(1, Math.max(0, (progress - p.delay) / .78));
      const blend = t * t * (3 - 2 * t);
      if (!blend && !p.star && !(progress && p.tile)) continue;
      const arc = Math.sin(blend * Math.PI);
      const z = p.z * cos - p.x * sin;
      const perspective = 1 / (1 - z);
      const tx = .04 + .92 * ((p.x * cos + p.z * sin) * perspective - left) / span;
      const ty = .5 + 1.8 * .92 * (p.y * perspective - midY) / span;
      const mix = Math.max(0, Math.min(1, (campus - p.delay * .55) / .88));
      const drift = Math.sin(Math.PI * mix) ** 2;
      const smooth = mix * mix * (3 - 2 * mix);
      const mx = morph === 1 ? p.qx : p.fromX + (p.qx - p.fromX) * shape;
      const my = morph === 1 ? p.qy : p.fromY + (p.qy - p.fromY) * shape;
      const mz = morph === 1 ? p.qz : p.fromZ + (p.qz - p.fromZ) * shape;
      const distance = mz * qc - mx * qs;
      const scale = modelZoom / (1 - .36 * distance);
      const qx = centerX + (mx * qc + mz * qs) * scale;
      const qy = centerY + (my + (towerVisible ? .32 : domeVisible ? .05 : isLogo ? .10 : .36) * distance) * scale;
      const destX = 1 + (tx + (qx - tx) * smooth - drift * p.travel - 1) / 1.45;
      const destY = 1 + (ty + (qy - ty) * smooth + drift * p.travel * 2.6 - 1) / 1.55;
      const x = p.sx + (destX - p.sx) * blend + arc * p.bend;
      const y = p.sy + (destY - p.sy) * blend - arc * .055;
      if (p.tile && progress && blend < .72) {
        const side = 3 - 2 * blend;
        ctx.globalAlpha = Math.min(1, progress * 8) * (1 - blend / .72) * .70;
        ctx.drawImage(sample, p.tile.x, p.tile.y, 3, 3, x * width - side / 2, y * height - side / 2, side, side);
      }
      ctx.globalAlpha = (p.star ? .22 : 0) * (1 - blend) + ((.24 + .52 * p.depth) * (1 - smooth) + (.12 + .66 * p.ink) * smooth) * blend;
      const pointDepth = domeVisible ? p.depth + (mz + .5 - p.depth) * smooth : p.depth;
      const size = (.70 + .30 * smooth) * (.65 + .65 * pointDepth) * Math.min(1, Math.max(.62, width / 435));
      ctx.globalAlpha *= hovered || focused || tapped ? 1 : .78;
      if (towerVisible && towerMasks) {
        const lo = Math.floor(pose), hi = Math.min(towerPoseSteps, lo + 1);
        const i = p.rank % towerCount;
        const a = towerMasks[lo][i], b = towerMasks[hi][i];
        ctx.globalAlpha *= 1 - smooth * shape * (1 - a - (b - a) * (pose - lo));
      }
      ctx.fillRect(x * width, y * height, size, size);
    }
    ctx.globalAlpha = 1;
    for (const rect of clearings) ctx.clearRect(...rect);
  }
  function step(now) {
    const dt = Math.min(48, now - last);
    last = now;
    rotationTime = (rotationTime + dt) % 16000;
    const distance = dt / (target ? 1450 : 920);
    progress += Math.sign(target - progress) * Math.min(distance, Math.abs(target - progress));
    morph = Math.min(1, morph + dt / 750);
    if ((requested || !campus) && selected !== requested) selectModel(requested);
    campusTarget = requested && selected === requested ? 1 : 0;
    campus += Math.sign(campusTarget - campus) * Math.min(dt / 1450, Math.abs(campusTarget - campus));
    paint();
    frame = target || progress > 0 ? requestAnimationFrame(step) : 0;
  }
  function update() {
    const key = (hovered || focused || tapped)?.dataset.academyTrigger;
    requested = models.has(key) ? key : "";
    const active = points.length ? 1 : 0;
    if (active && !target && progress === 0 && points.length) sampleRain();
    target = active;
    if (reduced.matches || !document.body.hasAttribute("data-playing")) {
      cancelAnimationFrame(frame);
      frame = 0;
      selectModel(requested);
      morph = 1;
      campus = requested ? 1 : 0;
      progress = target;
      paint();
    } else if (!frame && (target || progress > 0)) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  }
  function resize() {
    updateDensity();
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    bounds = canvas.getBoundingClientRect();
    rain.style.setProperty("--academy-ellipse", `${width * .60}px ${height * .65}px at ${bounds.left + width / 2}px ${bounds.top + height / 2}px`);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    measureText();
    paint();
  }
  function hoverArea(area) {
    clearTimeout(leaveTimer);
    if (hovered === area) return;
    hovered = area;
    if (area) tapped = null;
    update();
  }
  function leaveArea() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => hoverArea(null), 180);
  }
  for (const area of document.querySelectorAll("[data-academy-trigger]")) {
    area.addEventListener("pointerenter", e => { if (e.pointerType !== "touch") hoverArea(area); });
    area.addEventListener("pointerleave", leaveArea);
    // Embedded previews can forward mouse motion without a pointer boundary event.
    area.addEventListener("mousemove", e => {
      if (!e.sourceCapabilities?.firesTouchEvents) hoverArea(area);
    });
    area.addEventListener("mouseleave", leaveArea);
    area.addEventListener("focusin", () => { focused = area.matches(":focus-visible") ? area : null; update(); });
    area.addEventListener("focusout", () => { focused = null; update(); });
  }
  document.addEventListener("click", e => {
    const area = e.target.closest?.("[data-academy-trigger]");
    if (area !== hovered) hoverArea(null);
    tapped = hovered ? null : area;
    if (!area) focused = null;
    update();
  });
  allowOverlap.addEventListener("change", () => { measureText(); paint(); });
  const geometry = new ResizeObserver(resize);
  geometry.observe(canvas);
  geometry.observe(document.querySelector(".about"));
  window.addEventListener("scroll", () => { measureText(); paint(); }, { passive: true });
  new MutationObserver(update).observe(document.body, {attributes:true, attributeFilter:["data-playing"]});
  reduced.addEventListener("change", update);
  resize();
  try {
    const response = await fetch(canvas.dataset.points);
    if (!response.ok) return;
    const coords = new Float32Array(await response.arrayBuffer());
    const xmuResponse = await fetch(new URL("dewang-dome.bin", response.url));
    const xmuPoints = xmuResponse.ok ? new Uint16Array(await xmuResponse.arrayBuffer()) : null;
    if (xmuPoints) {
      models.set("xmu", xmuPoints);
      xmuCount = xmuPoints.length / 4;
    }
    const scale = .8 / 140, c = Math.cos(-.4), s = Math.sin(-.4);
    for (let i = 0; i < coords.length; i += 3) {
      // IIIS centers the bounding box before scaling and rotating the building.
      const x = coords[i], y = coords[i + 1] - 15.297566, z = coords[i + 2] + 6.167866;
      const viewZ = (z * c - x * s) * scale;
      points.push({
        qx: 0, qy: 0, qz: 0, ink: .5,
        travel: .03 + Math.random()*.16,
        x: (x * c + z * s) * scale, y: -y * scale, z: viewZ,
        depth: (viewZ + .175257) / .316390,
        sx: Math.random(), sy: Math.random(), delay: Math.random() * .21,
        bend: (Math.random() - .5) * .20, star: i % 99 === 0
      });
    }
    // One shuffled order gives each smaller viewport a nested, uniform subset.
    for (let i = 0; i < points.length; i++) {
      const pick = Math.floor(Math.random() * (i + 1));
      drawOrder[i] = drawOrder[pick];
      drawOrder[pick] = i;
    }
    // Spread the first visible particles across each institution's entire model.
    const slots = Array.from({length: institutionCount}, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    drawOrder.forEach((id, rank) => {
      points[id].rank = rank;
      points[id].modelIndex = slots[rank % slots.length];
      points[id].xmuIndex = xmuCount ? rank % xmuCount : 0;
    });
    updateDensity();
    update();
    await Promise.allSettled([...document.querySelectorAll(".about-entry[data-academy-trigger]")].map(async row => {
      const key = row.dataset.academyTrigger;
      if (!key || key === "xmu") return;
      let data;
      if (key === "sqz") {
        const tower = await fetch(new URL("west-bund.bin", response.url));
        if (tower.ok) {
          data = new Uint16Array(await tower.arrayBuffer());
          towerCount = data.length / 4;
          towerMasks = towerVisibility(data);
        }
      } else {
        data = await logoModel(row.querySelector("img"), institutionCount);
      }
      if (data) models.set(key, data);
      update();
    }));
  } catch {
    // The decorative canvas is optional when the asset is unavailable.
  }
})();
