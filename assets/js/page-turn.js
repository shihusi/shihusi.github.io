(() => {
  const root = document.documentElement;
  const storageKey = "shihusi.pageTurn";
  let arriving = false;
  try {
    arriving = sessionStorage.getItem(storageKey) === location.pathname;
    if (arriving && sessionStorage.getItem(storageKey + ".back") === "true") root.dataset.turnBack = "";
    sessionStorage.removeItem(storageKey);
  } catch {
    // Navigation still works when session storage is unavailable.
  }
  if (arriving) root.dataset.pageTurn = "in";

  document.addEventListener("DOMContentLoaded", () => {
    const next = document.querySelector(".page-next");
    if (!next) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let leaving = false;
    let lastWheel = arriving ? performance.now() : -Infinity;
    let wheelDistance = 0;
    let wheelDirection = 0;
    let touchStart = null;
    let navigationTimer;

    function atEdge(direction) {
      const page = document.scrollingElement;
      if (direction < 0) return page.scrollTop <= 2;
      return page.scrollHeight - page.clientHeight - page.scrollTop <= 2;
    }

    function turn(direction = 1) {
      if (leaving) return;
      leaving = true;
      root.toggleAttribute("data-turn-back", direction < 0);
      const href = direction < 0 ? new URL(next.dataset.prev, location.href).href : next.href;
      document.dispatchEvent(new CustomEvent("page-turn-start", {detail: {href}}));
      root.dataset.pageTurn = "out";
      navigationTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(storageKey + ".back", String(direction < 0));
          sessionStorage.setItem(storageKey, new URL(href).pathname);
        } catch {
          // The outgoing transition does not depend on storage.
        }
        location.assign(href);
      }, reducedMotion.matches ? 0 : 200);
    }

    next.addEventListener("click", event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      turn();
    });

    // Only a new gesture that starts at the relevant edge can turn the page.
    window.addEventListener("wheel", event => {
      const now = performance.now();
      const direction = Math.sign(event.deltaY);
      if (now - lastWheel > 160) {
        wheelDirection = atEdge(direction) ? direction : 0;
        wheelDistance = 0;
      }
      lastWheel = now;
      if (event.ctrlKey || event.defaultPrevented || direction !== wheelDirection ||
          Math.abs(event.deltaX) > Math.abs(event.deltaY) || !atEdge(direction)) {
        wheelDirection = 0;
      }
      if (!wheelDirection) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      wheelDistance += Math.abs(event.deltaY) * unit;
      if (wheelDistance >= 24) {
        if (event.cancelable) event.preventDefault();
        turn(direction);
      }
    }, { passive: false });

    window.addEventListener("touchstart", event => {
      touchStart = event.touches.length === 1 ? { point: event.touches[0], top: atEdge(-1), bottom: atEdge(1) } : null;
    }, { passive: true });
    window.addEventListener("touchcancel", () => { touchStart = null; });
    window.addEventListener("touchend", event => {
      if (!touchStart) return;
      const end = event.changedTouches[0];
      const dy = touchStart.point.clientY - end.clientY;
      const dx = Math.abs(touchStart.point.clientX - end.clientX);
      const direction = Math.sign(dy);
      const eligible = direction < 0 ? touchStart.top : touchStart.bottom;
      touchStart = null;
      if (!event.defaultPrevented && eligible && Math.abs(dy) >= 30 && Math.abs(dy) > dx * 1.2 && atEdge(direction)) turn(direction);
    }, { passive: true });

    window.addEventListener("pagehide", () => {
      clearTimeout(navigationTimer);
      if (!document.querySelector(".almanac-cloud")) {
        try { sessionStorage.removeItem("shihusi.sunPhase"); } catch {}
      }
    });
    window.addEventListener("pageshow", event => {
      if (!event.persisted) return;
      delete root.dataset.pageTurn;
      leaving = false;
      touchStart = null;
      wheelDirection = 0;
      lastWheel = performance.now();
    });
  });
})();
