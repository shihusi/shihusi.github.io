(() => {
  const canvas = document.querySelector(".almanac-cloud");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let seed = 1941;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const centerX = Number(canvas.dataset.centerX), centerY = Number(canvas.dataset.centerY);
  const radiusFraction = Number(canvas.dataset.radius);
  const points = [];
  const tau = 2 * Math.PI;
  // Surface tracers follow latitude-dependent currents on a rotating sphere.
  for (let i = 0; i < 13000; i++) {
    const y = 2 * random() - 1;
    const longitude = random() * tau;
    points.push({y, longitude, ring: Math.sqrt(1-y*y),
      speed: .13 + .045*(1-y*y), grain: .5 + .5*random(), drift: .25 + random()});
  }
  let width, height, clearings = [], frame = 0, last = 0, time = 0;
  let exitStart = 0;
  let hoverScale = 1, desiredScale = 1;
  function overSun(event) {
    if (event.target.closest("a, button, input, select, textarea, [contenteditable]")) return false;
    const box = canvas.getBoundingClientRect();
    const dx = event.clientX - box.left - box.width * centerX;
    const dy = event.clientY - box.top - box.height * centerY;
    return Math.hypot(dx,dy) <= box.width * radiusFraction * hoverScale;
  }
  window.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const over = overSun(event);
    desiredScale = over ? 1.12 : 1;
    document.body.classList.toggle("over-sun", over);
  }, {passive:true});
  window.addEventListener("click", event => {
    if (!event.defaultPrevented && event.detail && overSun(event))
      document.querySelector(".theme-toggle").click();
  });
  function release() {
    desiredScale = 1;
    document.body.classList.remove("over-sun");
  }
  document.documentElement.addEventListener("pointerleave", release);
  window.addEventListener("blur", release);
  function measure() {
    const box = canvas.getBoundingClientRect();
    width = box.width; height = box.height;
    const ratio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const walker = document.createTreeWalker(document.querySelector(".blog, .post"), NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    clearings = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      range.selectNodeContents(walker.currentNode);
      for (const r of range.getClientRects()) {
        if (r.bottom+8 > box.top && r.right+12 > box.left)
          clearings.push([r.left-box.left-12,r.top-box.top-8,r.width+24,r.height+16]);
      }
    }
    draw();
  }
  function draw() {
    ctx.clearRect(0,0,width,height);
    const stride = Math.max(1, Math.round(220000 / Math.max(1,width*height)));
    const seconds = time / 1000;
    const radius = width * radiusFraction * hoverScale;
    const night = document.documentElement.dataset.theme === "night";
    const animated = !reduced.matches && document.body.hasAttribute("data-playing");
    const entry = animated ? Math.min(1, time / 950) : 1;
    const exit = animated && exitStart ? Math.min(1, (performance.now()-exitStart)/200) : 0;
    const travel = (1-entry)**2 - exit*exit;
    const direction = document.documentElement.hasAttribute("data-turn-back") ? -1 : 1;
    for (let i=0; i<points.length; i+=stride) {
      const p = points[i];
      const longitude = p.longitude + seconds*p.speed;
      const z = p.ring * Math.cos(longitude);
      if (z <= 0) continue;
      const x = p.ring * Math.sin(longitude);
      const current = Math.sin(13*p.y + 2.8*Math.sin(longitude*3-seconds*.17));
      const light = Math.max(0, -.54*x - .48*p.y + .69*z);
      const tone = night ? light : 1-light;
      const shift = direction * travel * radius * p.drift;
      ctx.globalAlpha = entry * (1-exit) * (.09 + .69*tone)*p.grain*(.78 + .22*current);
      ctx.fillRect(width*centerX + .68*shift + radius*(x+.008*current*z),
        height*centerY - shift + radius*(p.y+.012*current*z),1.12,1.12);
    }
    for (const rect of clearings) ctx.clearRect(...rect);
  }
  function tick(now) {
    if (now-last >= (time < 950 || exitStart ? 16 : 50)) {
      const dt = Math.min(now-last,100);
      if (hoverScale !== desiredScale) {
        hoverScale += (desiredScale-hoverScale) * (1-Math.exp(-dt/165));
        if (Math.abs(desiredScale-hoverScale) < .001) hoverScale = desiredScale;
        canvas.dataset.sunScale = String(hoverScale);
      }
      time += dt; last=now; draw();
    }
    frame=requestAnimationFrame(tick);
  }
  function playback() {
    cancelAnimationFrame(frame);
    if (!reduced.matches && !document.hidden && document.body.hasAttribute("data-playing")) {
      last=performance.now(); frame=requestAnimationFrame(tick);
    }
  }
  new ResizeObserver(measure).observe(canvas);
  window.addEventListener("scroll",measure,{passive:true});
  document.fonts.ready.then(measure);
  new MutationObserver(playback).observe(document.body,{attributes:true,attributeFilter:["data-playing"]});
  reduced.addEventListener("change", playback);
  document.addEventListener("visibilitychange", playback);
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  new MutationObserver(() => {
    exitStart = document.documentElement.dataset.pageTurn === "out" ? performance.now() : 0;
  }).observe(document.documentElement,{attributes:true,attributeFilter:["data-page-turn"]});
  measure(); playback();
})();
