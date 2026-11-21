(async () => {
  const canvas = document.querySelector(".astra-galaxy");
  const stage = canvas.parentElement;
  const poster = stage.querySelector(".post-point-cloud");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  try { await poster.decode(); } catch { return; }

  // Sample the Astra artwork itself so its open outer arm and off-centre core
  // retain their original proportions as successive stars flow through them.
  const sampler = document.createElement("canvas");
  sampler.width = 500;
  sampler.height = Math.round(500 * poster.naturalHeight / poster.naturalWidth);
  const brush = sampler.getContext("2d");
  brush.drawImage(poster, 0, 0, sampler.width, sampler.height);
  const pixels = brush.getImageData(0, 0, sampler.width, sampler.height).data;
  const stars = [];
  for (let y = 0; y < sampler.height; y++) {
    for (let x = 0; x < sampler.width; x++) {
      const alpha = pixels[(y * sampler.width + x) * 4 + 3] / 255;
      if (!alpha || Math.random() > Math.min(1, 2.6 * alpha)) continue;
      const dx = x / sampler.width - .478;
      const dy = (y - sampler.height * .61) / sampler.width;
      const r = Math.hypot(dx, dy);
      stars.push({r, angle: Math.atan2(dy, dx), phase: Math.random(),
        speed: .095 + .08 * Math.random(), depth: (Math.random() - .5) * (.04 + r * .20),
        size: .52 + Math.sqrt(alpha) * 1.42, ink: .27 + Math.sqrt(alpha) * .70});
    }
  }

  let width, height, fit, frame = 0, previous = 0, time = 0;
  let aimX = 0, aimY = 0, tiltX = 0, tiltY = 0;
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit = Math.min(width, height * sampler.width / sampler.height);
  }
  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (now - previous < 32) return;
    const dt = previous ? Math.min(.1, (now - previous) / 1000) : 0;
    previous = now;
    time += dt;
    const ease = 1 - Math.exp(-dt * 4);
    tiltX += (aimX - tiltX) * ease;
    tiltY += (aimY - tiltY) * ease;
    const yaw = .12 * Math.sin(time * .23) + tiltX * .3;
    const pitch = .07 * Math.sin(time * .17) + tiltY * .17;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2 - .022 * fit;
    const centerY = height / 2 + .11 * fit * sampler.height / sampler.width;
    for (const star of stars) {
      const life = (star.phase + time * star.speed) % 1;
      const travel = life - .5;
      const angle = star.angle + travel * .35;
      const r = star.r * (1 + travel * .075);
      const x = r * Math.cos(angle), y = r * Math.sin(angle);
      const depth = star.depth * cy - x * sy;
      const px = cx + fit * (x * cy + star.depth * sy);
      const py = centerY + fit * (y * cp - depth * sp);
      const size = star.size * Math.max(.65, fit / 710);
      ctx.globalAlpha = star.ink * Math.min(1, life * 7, (1-life) * 7);
      ctx.fillRect(px, py, size, size);
    }
  }
  document.addEventListener("pointermove", e => {
    const box = canvas.getBoundingClientRect();
    aimX = Math.max(-1, Math.min(1, (e.clientX-box.left-box.width/2)/(fit/2 || 1)));
    aimY = Math.max(-1, Math.min(1, (e.clientY-box.top-box.height/2)/(box.height/2 || 1)));
  }, {passive:true});
  document.documentElement.addEventListener("pointerleave", () => { aimX = aimY = 0; });
  function playback() {
    cancelAnimationFrame(frame);
    const active = !reduced.matches && !document.hidden;
    stage.classList.toggle("astra-playing", active);
    ctx.clearRect(0, 0, width, height);
    previous = 0;
    if (active) frame = requestAnimationFrame(animate);
  }
  resize();
  new ResizeObserver(resize).observe(stage);
  reduced.addEventListener("change", playback);
  document.addEventListener("visibilitychange", playback);
  playback();
})();
