(() => {
  const canvas = document.querySelector(".glyph-rain");
  const context = canvas.getContext("2d");
  if (!context) return;
  const readingMask = document.createElement("canvas");

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const keywords = [
    "AGENTS", "ROBOTICS", "EMBODIEDAI", "REINFORCEMENTLEARNING", "FOUNDATIONMODELS",
    "DEXTEROUSMANIPULATION", "MOTIONPLANNING", "REALTOSIM", "FLOWMATCHING",
    "ROBOTLEARNING", "VISUALGROUNDING", "POLICYLEARNING", "VLM", "VLA"
  ];
  const longestKeyword = Math.max(...keywords.map(word => word.length));
  const glyphs = [...new Set(keywords.join(""))].join("");

  function randomColumn(rows) {
    let text = "";
    while (text.length < rows) {
      text += keywords[Math.floor(Math.random() * keywords.length)];
    }
    // Rows increase downhill, while the rotated words read uphill.
    return Array.from(text, letter => glyphs.indexOf(letter)).reverse();
  }
  const cell = 32;
  const atlas = document.createElement("canvas");
  atlas.width = cell * glyphs.length;
  atlas.height = cell;
  const ink = atlas.getContext("2d");
  ink.font = '500 23px Futura, "Avenir Next", sans-serif';
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  for (let i = 0; i < glyphs.length; i++) {
    ink.save();
    ink.translate((i + .5) * cell, cell / 2);
    ink.rotate(-Math.PI / 2);
    ink.fillText(glyphs[i], 0, 0, 20);
    ink.restore();
  }

  let streams = [];
  let width, height;
  let elapsed = 0;
  let playing = !reducedMotion.matches;
  let timer;
  const sun = document.querySelector(".almanac-cloud");
  let field = null;
  let previousRain = null;
  let localRefill = new Map();
  let transitionStart = 0;
  let sizeKey = "";

  const silence = document.querySelector(".rain-silence");
  let silenced = false, collecting = 0;
  try { silenced = localStorage.getItem("shihusi.silence") === "on"; } catch {}
  function syncSilence() {
    canvas.style.visibility = silenced ? "hidden" : "";
    silence.classList.toggle("shows-flow", silenced && !collecting);
    silence.setAttribute("aria-label", silenced ? "Flow — resume letter rain" : "Silence letter rain");
  }
  syncSilence();
  let drawGathering = null;
  let captures = null;
  function paintGlyph(atlasX, x, y, size) {
    if (captures) {
      const matrix = context.getTransform();
      const center = matrix.transformPoint({x:x+size/2, y:y+size/2});
      const ratio = canvas.width/canvas.clientWidth;
      const px = center.x/ratio, py = center.y/ratio;
      if (px >= 0 && py >= 0 && px <= canvas.clientWidth && py <= canvas.clientHeight)
        captures.push({x:px,y:py,size,atlasX,angle:Math.atan2(matrix.b,matrix.a),alpha:context.globalAlpha});
    }
    context.drawImage(atlas,atlasX,0,cell,cell,x,y,size,size);
  }
  function draw() {
    if (silenced || drawGathering) return;
    context.clearRect(0, 0, width, height);
    const sunScale = sun ? Number(sun.dataset.sunScale || 1) : 1;
    for (const stream of streams) {
      const position = stream.start + elapsed * stream.speed;
      if (position < 0) continue;
      const cursor = Math.floor(position / stream.step);
      const head = cursor % stream.rows;
      const pass = Math.floor(cursor / stream.rows);
      if (pass !== stream.pass) {
        stream.letters = randomColumn(stream.rows);
        stream.pass = pass;
      }
      const visibility = stream.revealAt === undefined ? 1 : Math.min(1, Math.max(0, (elapsed-stream.revealAt)/.65));
      for (let age = 0; age < stream.length; age++) {
        const row = head - age;
        const y = row * stream.step;
        if (row < 0 || y > height) continue;
        // The head reveals a fixed sequence along the diagonal, one letter at a time.
        const index = stream.letters[row];
        const fade = Math.min(1, (stream.length - age) / (stream.length * .72));
        context.globalAlpha = visibility * stream.strength * fade * (age === 0 ? 1 : .7);
        if (field) {
          const half = stream.glyphSize / 2;
          const dx = stream.x + half - field.x;
          const dy = y + half - field.y;
          const r = field.radius * sunScale * 1.32 + half;
          const reach = 2.1 * r;
          if (Math.abs(dx) < 3*r && Math.abs(dy) < reach) {
            // A single smooth bend, with zero slope and curvature where it rejoins the rain.
            const u = dy / reach;
            const taper = 1 - u*u;
            const bend = Math.sign(dx || 1) * r * (1 - Math.abs(dx)/(3*r)) ** 2;
            const offset = bend * taper ** 3;
            const slope = -6 * bend * u * taper ** 2 / reach;
            context.save();
            context.translate(stream.x + half + offset, y + half);
            context.rotate(-Math.atan(slope));
            paintGlyph(index*cell,-half,-half,stream.glyphSize);
            context.restore();
            continue;
          }
        }
        paintGlyph(index*cell,stream.x,y,stream.glyphSize);
      }
    }
    context.globalAlpha = 1;
    if (previousRain) {
      const {layer, ink, mask, opacity, targetOpacity} = previousRain;
      const t = Math.min(1, (performance.now()-transitionStart)/1800);
      const blend = t*t*(3-2*t);
      ink.clearRect(0,0,layer.width,layer.height);
      ink.drawImage(canvas,0,0);
      if (mask.naturalWidth) {
        ink.save();
        ink.globalCompositeOperation = "destination-out";
        ink.globalAlpha = .94;
        ink.drawImage(mask,0,0,layer.width,layer.height);
        ink.restore();
      }
      layer.style.opacity = opacity*(1-blend);
      canvas.style.opacity = targetOpacity*blend;
      if (t === 1) {
        layer.remove();
        canvas.style.removeProperty("opacity");
        previousRain = null;
      }
    }
    if (readingMask) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = .94;
      context.drawImage(readingMask, 0, 0, canvas.width, canvas.height);
      context.restore();
    }
  }

  // Continue the same columns and phase when navigating between local pages.
  const rainKey = "shihusi.rainFrame";
  let arrival;
  try {
    const saved = JSON.parse(sessionStorage.getItem(rainKey));
    sessionStorage.removeItem(rainKey);
    if (saved?.version === 6 && saved.theme === document.documentElement.dataset.theme && Date.now()-saved.stamp < 5000) arrival = saved;
  } catch { /* Storage is optional. */ }
  window.addEventListener("pagehide", () => {
    try {
      // Visible columns retain their exact phase. Only columns still waiting
      // offscreen in Work resume their ordinary shared-scene phase.
      const outgoing = streams.map(stream => {
        const saved = localRefill.get(stream);
        return saved && elapsed < saved.enterAt ? {...saved.shared, revealAt:elapsed} : stream;
      });
      sessionStorage.setItem(rainKey, JSON.stringify({version:6, theme:document.documentElement.dataset.theme, stamp:Date.now(), width,height,elapsed,streams:outgoing,
        mask:readingMask.toDataURL(), opacity:getComputedStyle(canvas).opacity,
        cssMask:getComputedStyle(canvas).maskImage}));
    } catch { /* Navigation can continue without a handoff. */ }
  });

  function resize() {
    const viewWidth = canvas.clientWidth;
    const viewHeight = canvas.clientHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const key = [viewWidth,viewHeight,scale,document.documentElement.dataset.theme].join("/");
    if (key === sizeKey) return;
    sizeKey = key;
    localRefill.clear();
    canvas.width = Math.round(viewWidth * scale);
    canvas.height = Math.round(viewHeight * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    // Rotate the rain grid, expanding it so streams also enter from the right edge.
    const tilt = 34 * Math.PI / 180;
    width = viewWidth * Math.cos(tilt) + viewHeight * Math.sin(tilt);
    height = viewHeight * Math.cos(tilt) + viewWidth * Math.sin(tilt);
    context.translate(viewWidth / 2, viewHeight / 2);
    context.rotate(tilt);
    context.translate(-width / 2, -height / 2);
    if (sun) {
      const box = sun.getBoundingClientRect(), sky = canvas.getBoundingClientRect();
      const x = box.left - sky.left + box.width * Number(sun.dataset.centerX) - viewWidth / 2;
      const y = box.top - sky.top + box.height * Number(sun.dataset.centerY) - viewHeight / 2;
      field = {x: width/2 + x*Math.cos(tilt) + y*Math.sin(tilt),
        y: height/2 - x*Math.sin(tilt) + y*Math.cos(tilt),
        radius: box.width * Number(sun.dataset.radius)};
    }
    if (arrival && arrival.streams?.length && Math.abs(arrival.width-width)<32 && Math.abs(arrival.height-height)<32) {
      streams = arrival.streams;
      elapsed = arrival.elapsed + (Date.now()-arrival.stamp)/1000;
      if (playing && !silenced) {
        const layer = canvas.cloneNode(false);
        layer.style.maskImage = arrival.cssMask || "none";
        canvas.before(layer);
        const mask = new Image();
        if (arrival.mask) mask.src = arrival.mask;
        previousRain = {layer, ink:layer.getContext("2d"), mask,
          opacity:Number(arrival.opacity ?? 1), targetOpacity:Number(getComputedStyle(canvas).opacity)};
        transitionStart = performance.now();
      }
      arrival = null;
      draw();
      return;
    }
    arrival = null;
    streams = [];
    const spacingScale = document.documentElement.dataset.theme === "night" ? 1.2 : 1.55 / .70;
    for (const far of [true, false]) {
      const spacing = (far ? 30 : 50) * spacingScale;
      for (let x = 0; x < width; x += spacing) {
        const glyphSize = far ? 11 : 17;
        const step = glyphSize * .67;
        const trailSize = glyphSize * (6 + Math.random() * (far ? 14 : 22));
        const length = Math.max(longestKeyword + 5, Math.ceil(trailSize / step));
        const rows = Math.ceil(height / step) + length + Math.floor(Math.random() * 18);
        streams.push({
          x: x + Math.random() * spacing * .7, glyphSize, step, length, rows,
          start: Math.random() * rows * step,
          speed: (far ? 27 : 54) + Math.random() * 45,
          strength: (far ? .24 : .62) + Math.random() * .17,
          pass: 0, letters: randomColumn(rows)
        });
      }
    }
    draw();
  }

  function updatePlayback() {
    clearInterval(timer);
    if (!playing && previousRain) {
      previousRain.layer.remove();
      previousRain = null;
      canvas.style.removeProperty("opacity");
    }
    document.body.toggleAttribute("data-playing", playing);
    if (!playing || silenced || document.hidden) return;
    let previous = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      elapsed += Math.min((now - previous) / 1000, .2);
      previous = now;
      draw();
    }, 1000 / 18);
  }

  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(resize).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"]
  });

  // Measure actual ink so a short, left-aligned list gets a narrower clearing
  // than a full article. Keep that clearing anchored to the page during scroll.
  if (readingMask) {
    const maskInk = readingMask.getContext("2d");
    const footer = document.querySelector(".site-contact");
    const regions = document.body.classList.contains("night-home")
      ? [footer] : [document.querySelector(".site-header"), document.querySelector(".site-content"), footer];
    let boxes = [];
    let measureAgain = true;
    let pending = 0;

    function refreshMask() {
      pending = 0;
      const x = window.scrollX, y = window.scrollY;
      if (measureAgain) {
        measureAgain = false;
        boxes = [];
        const range = document.createRange();
        function remember(rect, fixed) {
          if (rect.width && rect.height) boxes.push({
            fixed, left: rect.left + (fixed ? 0 : x), top: rect.top + (fixed ? 0 : y), width: rect.width, height: rect.height
          });
        }
        for (const region of regions) {
          const firstBox = boxes.length;
          const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim() ||
                walker.currentNode.parentElement.closest(".work-rain-word")) continue;
            range.selectNodeContents(walker.currentNode);
            for (const rect of range.getClientRects()) remember(rect, region === footer);
          }
          for (const media of region.querySelectorAll("img, video, iframe, pre, .selected-work a")) {
            remember(media.getBoundingClientRect(), region === footer);
          }
          if (region.matches(".site-content") && boxes.length > firstBox) {
            const content = boxes.splice(firstBox);
            const left = Math.min(...content.map(b => b.left));
            const top = Math.min(...content.map(b => b.top));
            const right = Math.max(...content.map(b => b.left + b.width));
            const bottom = Math.max(...content.map(b => b.top + b.height));
            boxes.push({ reading: true, left, top, width: right - left, height: bottom - top });
          }
        }
      }

      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const scale = .25;
      const mw = Math.ceil(w * scale), mh = Math.ceil(h * scale);
      if (readingMask.width !== mw || readingMask.height !== mh) {
        readingMask.width = mw;
        readingMask.height = mh;
      }
      maskInk.setTransform(mw / w, 0, 0, mh / h, 0, 0);
      maskInk.clearRect(0, 0, w, h);
      maskInk.shadowColor = "black";
      const day = document.documentElement.dataset.theme !== "night";
      for (const box of boxes) {
        const top = box.fixed ? box.top : box.top - y;
        if (top + box.height < -160 || top > h + 160) continue;
        if (box.reading) {
          const fringe = day ? Math.min(120, w * .15) : Math.min(80, w * .1);
          maskInk.shadowBlur = 0;
          for (let layer = 12; layer >= 0; layer--) {
            const pad = (day ? 18 : 6) + fringe * layer / 12;
            maskInk.globalAlpha = layer === 0 ? 1 : .18 * (1 - layer / 13);
            maskInk.beginPath();
            maskInk.roundRect(box.left - x - pad, top - pad,
              box.width + 2 * pad, box.height + 2 * pad, pad);
            maskInk.fill();
          }
          continue;
        }
        maskInk.globalAlpha = box.fixed ? .75 : 1;
        maskInk.shadowBlur = box.fixed ? 9 : 4;
        const padX = (box.fixed ? 28 : 8) + (day ? 10 : 0);
        const padY = (box.fixed ? 16 : 3) + (day ? 7 : 0);
        maskInk.fillRect(box.left - (box.fixed ? 0 : x) - padX, top - padY,
          box.width + 2 * padX, box.height + 2 * padY);
      }
      draw();
    }

    function queueMask() {
      if (!pending) pending = requestAnimationFrame(refreshMask);
    }
    function layoutChanged() {
      measureAgain = true;
      queueMask();
    }
    const layoutObserver = new ResizeObserver(layoutChanged);
    for (const region of regions) layoutObserver.observe(region);
    layoutObserver.observe(canvas);
    new MutationObserver(queueMask).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
    document.fonts.ready.then(layoutChanged);
    document.querySelector(".site-content").addEventListener("animationend", layoutChanged);
    window.addEventListener("scroll", queueMask, { passive: true });
    window.addEventListener("pageshow", layoutChanged);
    layoutChanged();
  }

  const work = document.querySelector(".selected-work");
  if (work && document.documentElement.dataset.workEntrance === "pending") {
    // Use the current rain trails as departure points, in viewport coordinates.
    function visibleLetters() {
      const matrix = context.getTransform();
      const scale = canvas.width / canvas.clientWidth;
      const letters = [];
      for (const stream of streams) {
        const head = Math.floor((stream.start + elapsed * stream.speed) / stream.step) % stream.rows;
        for (let row = Math.max(0, head-stream.length+1); row <= head; row++) {
          const point = matrix.transformPoint({x:stream.x + stream.glyphSize/2, y:row*stream.step + stream.glyphSize/2});
          const x = point.x/scale, y = point.y/scale;
          if (x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight)
            letters.push({x, y, glyph:glyphs[stream.letters[row]], size:stream.glyphSize,
              alpha:stream.strength * Math.min(1,(stream.length-head+row)/(stream.length*.72)) * (head===row ? 1 : .7)});
        }
      }
      return letters;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      // Layout and animation setup run in this same task, before the next paint.
      delete document.documentElement.dataset.workEntrance;
      if (!playing || silenced || reducedMotion.matches) return;
      const sources = visibleLetters();
      if (!sources.length) return;
      work.classList.add("assembling");
      // Shuffling once distributes each row across the field without clustering at one origin.
      for (let i = sources.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sources[i], sources[j]] = [sources[j], sources[i]];
      }
      const diagonal = Math.hypot(innerWidth, innerHeight);
      const destinations = [], completions = [], original = sources.slice();
      const rows = Array.from(work.querySelectorAll("li"));
      const labels = new Map();
      work.querySelectorAll(".work-project-title, .work-project-links > *").forEach(link => {
        const row = rows.indexOf(link.closest("li"));
        const title = link.textContent;
        labels.set(link, title);
        if (link.matches("a:not([aria-label])")) link.setAttribute("aria-label", title);
        const letters = [];
        const words = title.split(/(\s+)/).map(word => {
          if (!word.trim()) return document.createTextNode(word);
          const group = document.createElement("span");
          group.className = "work-rain-word";
          group.setAttribute("aria-hidden", "true");
          for (const character of word) {
            const letter = document.createElement("span");
            letter.textContent = character;
            group.append(letter);
            letters.push(letter);
          }
          return group;
        });
        link.replaceChildren(...words);
        const targets = letters.map(letter => letter.getBoundingClientRect());
        const flights = letters.map((letter,i) => {
          const target = targets[i];
          const character = letter.textContent;
          // Prefer a rain glyph that already matches the destination.
          const match = sources.findIndex(s => s.glyph === character.toUpperCase());
          const source = sources.splice(Math.max(0,match),1)[0] || original[i % original.length];
          const dx = source.x-target.left, dy = source.y-target.top;
          const travel = 780 + 400*Math.min(1,Math.hypot(dx,dy)/diagonal);
          const delay = Math.max(0,1090 + row*155 + 300*i/letters.length - travel);
          destinations.push({x:target.left+target.width/2, y:target.top+target.height/2, delay, travel});
          letter.style.width = target.width+"px";
          letter.textContent = source.glyph;
          const frames = Array.from({length:25}, (_,step) => {
            const t = step/24, u = 1-t;
            const px = u**3*dx + 3*u*u*t*(dx-40) + 3*u*t*t*32;
            const py = u**3*dy + 3*u*u*t*(dy+65) - 3*u*t*t*12;
            return {transform:"translate("+px+"px,"+py+"px) rotate("+(-56*u)+"deg) scale("+(.62+.38*t)+")",
              opacity:source.alpha*.62+(1-source.alpha*.62)*t};
          });
          const flight = letter.animate(frames,{duration:travel,delay,
            easing:"cubic-bezier(.32,.06,.2,1)",fill:"backwards"});
          setTimeout(() => { letter.textContent = character; },delay + travel*.58);
          return flight.finished;
        });
        completions.push(...flights);
      });
      // The remaining drops share the flights, converging into the same strokes.
      // Paint them in a single pass instead of creating a DOM node for every drop.
      if (!destinations.length) {
        work.classList.remove("assembling");
        return;
      }
      previousRain?.layer.remove();
      previousRain = null;
      canvas.style.removeProperty("opacity");
      const begun = performance.now();
      const trails = sources.map((drop,i) => ({drop, target:i % destinations.length, atlasX:glyphs.indexOf(drop.glyph)*cell}));
      drawGathering = () => {
        const now = performance.now()-begun;
        context.save();
        const scale = canvas.width/canvas.clientWidth;
        context.setTransform(scale,0,0,scale,0,0);
        context.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
        for (const {drop,target,atlasX} of trails) {
          const dest = destinations[target];
          const t = Math.min(1,Math.max(0,(now-dest.delay)/dest.travel));
          if (t === 1) continue;
          const u = t*t*(3-2*t);
          const bend = Math.sin(Math.PI*t);
          const x = drop.x+(dest.x-drop.x)*u-28*bend;
          const y = drop.y+(dest.y-drop.y)*u+42*bend;
          context.globalAlpha = drop.alpha*(1-u*u);
          context.save();
          context.translate(x,y);
          context.rotate((34+56*u)*Math.PI/180);
          paintGlyph(atlasX,-drop.size/2,-drop.size/2,drop.size);
          context.restore();
        }
        context.restore();
      };
      let gatherFrame;
      function animateGathering() {
        drawGathering();
        gatherFrame = requestAnimationFrame(animateGathering);
      }
      animateGathering();
      Promise.allSettled(completions).then(() => {
        work.classList.remove("assembling");
        cancelAnimationFrame(gatherFrame);
        drawGathering = null;
        labels.forEach((title, link) => { link.textContent = title; });
        startRainAtEdges(true);
        draw();
      });
    });
    observer.observe(work);
    document.documentElement.dataset.workEntrance = "ready";
  }

  function startRainAtEdges(workOnly) {
    localRefill.clear();
    // Each column crosses either the top or the right viewport boundary.
    // Start its head upstream of both, including the rotated glyph footprint.
    const matrix = context.getTransform();
    const refillStart = elapsed;
    const arrivals = streams.slice();
    for (let i = arrivals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arrivals[i], arrivals[j]] = [arrivals[j], arrivals[i]];
    }
    arrivals.forEach((stream, i) => {
      const delay = i < 2 ? i * .85 : 2.4 + 10 * (i - 2 + Math.random()) / Math.max(1, arrivals.length - 2);
      const origin = matrix.transformPoint({x:stream.x, y:0});
      const top = -origin.y / matrix.d;
      const right = (canvas.width - origin.x) / matrix.c;
      const lead = 2 * stream.glyphSize;
      if (workOnly) localRefill.set(stream, {
        shared: {...stream},
        enterAt: refillStart + delay + (lead - stream.glyphSize) / stream.speed
      });
      stream.start = Math.max(0, top, right) - lead - (refillStart + delay) * stream.speed;
      stream.letters = randomColumn(stream.rows);
      stream.pass = 0;
    });
  }

  function collectRain() {
    captures = [];
    if (drawGathering) drawGathering();
    else draw();
    const glyphsInFlight = captures;
    captures = null;
    const box = canvas.getBoundingClientRect();
    const end = silence.getBoundingClientRect();
    const targetX = end.left + end.width/2 - box.left;
    const targetY = end.top + end.height/2 - box.top;
    const overlay = document.createElement("canvas");
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1";
    overlay.style.filter = getComputedStyle(canvas).filter;
    overlay.setAttribute("aria-hidden","true");
    const brush = overlay.getContext("2d");
    const ratio = overlay.width/box.width;
    brush.scale(ratio,ratio);
    const opacity = Number(getComputedStyle(canvas).opacity);
    const mask = readingMask.getContext("2d").getImageData(0,0,readingMask.width,readingMask.height).data;
    for (const g of glyphsInFlight) {
      const mx = Math.min(readingMask.width-1, Math.floor(g.x/box.width*readingMask.width));
      const my = Math.min(readingMask.height-1, Math.floor(g.y/box.height*readingMask.height));
      g.alpha *= opacity*(1-.94*mask[4*(my*readingMask.width+mx)+3]/255);
      const distance = Math.hypot(targetX-g.x,targetY-g.y);
      g.duration = 850 + 580*distance/Math.hypot(box.width,box.height);
      g.delay = 160*Math.random();
      g.bend = Math.min(95,distance*.22);
    }
    document.body.append(overlay);
    const start = performance.now();
    function sweep(now) {
      brush.clearRect(0,0,box.width,box.height);
      let moving = false;
      for (const g of glyphsInFlight) {
        const t = Math.max(0,(now-start-g.delay)/g.duration);
        if (t >= 1) continue;
        moving = true;
        const u = 1-t, ease = t*t*(3-2*t);
        const arc = 3*u*u*t*g.bend;
        const x = g.x+(targetX-g.x)*ease-.6*arc;
        const y = g.y+(targetY-g.y)*ease+arc-60*u*t*t;
        const size = g.size*(1-.7*t**3);
        brush.save();
        brush.translate(x,y);
        brush.rotate(g.angle+(Math.PI/2-g.angle)*ease);
        brush.globalAlpha = g.alpha*Math.min(1,u/.12);
        brush.drawImage(atlas,g.atlasX,0,cell,cell,-size/2,-size/2,size,size);
        brush.restore();
      }
      if (moving && silenced) collecting=requestAnimationFrame(sweep);
      else { overlay.remove(); collecting=0; syncSilence(); }
    }
    collecting=requestAnimationFrame(sweep);
  }
  silence.hidden = false;
  silence.addEventListener("click", () => {
    if (!silenced && !reducedMotion.matches && !collecting) collectRain();
    silenced = !silenced;
    if (silenced) {
      previousRain?.layer.remove();
      previousRain = null;
      canvas.style.removeProperty("opacity");
      work?.querySelectorAll(".work-rain-word > span").forEach(letter =>
        letter.getAnimations().forEach(animation => animation.finish()));
    }
    try {
      if (silenced) localStorage.setItem("shihusi.silence","on");
      else localStorage.removeItem("shihusi.silence");
    } catch {}
    if (!silenced && playing) startRainAtEdges(false);
    syncSilence();
    updatePlayback();
    if (!silenced) draw();
  });
  reducedMotion.addEventListener("change", () => {
    playing = !reducedMotion.matches;
    updatePlayback();
  });
  document.addEventListener("visibilitychange", updatePlayback);
  updatePlayback();
})();
