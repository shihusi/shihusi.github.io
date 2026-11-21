(() => {
  const canvas = document.querySelector(".interactive-mist");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const source = new Image();
  const root = document.documentElement;
  const motion = matchMedia("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)");
  const phase = Math.random() * Math.PI * 2;
  let pointer = null, frame = 0, last = 0, enabled = false;
  let field, pixels, shiftX, shiftY, density, warpedX, warpedY;
  let width = 0, height = 0, radius = 0;

  // Smooth variations at two scales, fixed to the sky so a resting mouse stays still.
  function warp(x, y) {
    return .29 * Math.sin(2.3 * x + 1.7 * y + phase + .8 * Math.sin(2.6 * y))
      + .10 * Math.sin(4.7 * y - 3.1 * x - phase);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    // Sample only the broad fog shapes. The printed grain stays in the CSS background.
    canvas.width = Math.ceil(w / 4);
    canvas.height = Math.ceil(h / 4);
    const cols = canvas.width, rows = canvas.height;
    radius = Math.max(24, Math.min(46, cols * .20));
    const scale = Math.max(w / source.width, h / source.height);
    const sw = w / scale, sh = h / scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2,
      sw, sh, 0, 0, cols, rows);
    const rgba = ctx.getImageData(0, 0, cols, rows).data;
    field = new Float32Array(cols * rows);
    warpedX = new Float32Array(field.length);
    warpedY = new Float32Array(field.length);
    for (let i = 0; i < field.length; i++) {
      const x = (i % cols) / radius, y = Math.floor(i / cols) / radius;
      warpedX[i] = x * .94 + warp(x, y);
      warpedY[i] = y * 1.08 + warp(y + 3.7, -x);
      field[i] = (rgba[4 * i] + 2 * rgba[4 * i + 1] + rgba[4 * i + 2]) / 4;
    }
    pixels = ctx.createImageData(cols, rows);
    shiftX = new Float32Array(field.length);
    shiftY = new Float32Array(field.length);
    density = new Float32Array(field.length);
    ctx.clearRect(0, 0, cols, rows);
  }

  function schedule() {
    if (enabled && !frame) frame = requestAnimationFrame(draw);
  }

  function draw(now) {
    frame = 0;
    if (now - last < 1000 / 30) return schedule();
    const dt = Math.min((now - last) / 1000, .08);
    last = now;
    resize();
    const cols = canvas.width, rows = canvas.height;
    const px = pointer ? pointer.x * cols / width : 0;
    const py = pointer ? pointer.y * rows / height : 0;
    const u = px / radius, v = py / radius;
    const centreX = u * .94 + warp(u, v);
    const centreY = v * 1.08 + warp(v + 3.7, -u);
    const open = 1 - Math.exp(-dt * 15), close = 1 - Math.exp(-dt * 2.4);
    let moving = false;
    for (let i = 0; i < field.length; i++) {
      const x = i % cols, y = Math.floor(i / cols);
      const dx = x - px, dy = y - py;
      const nearby = pointer && Math.abs(dx) < radius * 2 && Math.abs(dy) < radius * 2;
      if (!nearby && !density[i] && !shiftX[i] && !shiftY[i]) continue;
      const r = nearby ? Math.min(1, Math.hypot(warpedX[i] - centreX, warpedY[i] - centreY)) : 1;
      // Apply the uneven falloff to the original fog's displacement and density.
      const push = .52 * (1 - r) ** 2;
      const area = (1 - push) * (1 - push + 1.04 * r * (1 - r)) - 1;
      const mix = r < 1 ? open : close;
      const ex = -dx * push - shiftX[i], ey = -dy * push - shiftY[i];
      const ed = area - density[i];
      const alphaIndex = i * 4 + 3;
      if (Math.abs(ex) + Math.abs(ey) + 10 * Math.abs(ed) < .008 && r === 1) {
        shiftX[i] = shiftY[i] = density[i] = 0;
        pixels.data[alphaIndex] = 0;
        continue;
      }
      shiftX[i] += ex * mix;
      shiftY[i] += ey * mix;
      density[i] += ed * mix;
      if (Math.abs(ex) + Math.abs(ey) + 10 * Math.abs(ed) > .008) moving = true;
      const sx = Math.max(0, Math.min(cols - 1, Math.round(x + shiftX[i])));
      const sy = Math.max(0, Math.min(rows - 1, Math.round(y + shiftY[i])));
      const original = field[i];
      const change = 3 + (field[sy * cols + sx] - 3) * (1 + density[i]) - original;
      // Composite only the luminance difference, leaving the original art visible.
      const ink = change < 0 ? 3 : 232;
      pixels.data[alphaIndex - 3] = ink;
      pixels.data[alphaIndex - 2] = ink;
      pixels.data[alphaIndex - 1] = change < 0 ? ink : 228;
      pixels.data[alphaIndex] = 255 * change / (ink - original || 1);
    }
    ctx.putImageData(pixels, 0, 0);
    if (moving) schedule();
  }

  function release() {
    pointer = null;
    schedule();
  }

  function sync() {
    const night = root.dataset.theme === "night" && motion.matches;
    if (night && !source.src) source.src = canvas.dataset.field;
    const paused = !document.body.hasAttribute("data-playing");
    enabled = night && source.complete && source.naturalWidth > 0 && !paused && !document.hidden;
    if (enabled) schedule();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      if (!night) {
        width = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  window.addEventListener("pointermove", event => {
    if (!enabled || event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }, { passive: true });
  root.addEventListener("pointerleave", release);
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", sync);
  motion.addEventListener("change", sync);
  const state = new MutationObserver(sync);
  state.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  state.observe(document.body, { attributes: true, attributeFilter: ["data-playing"] });
  new ResizeObserver(schedule).observe(canvas.parentElement);
  source.addEventListener("load", sync);
  sync();
})();
