(() => {
  const storageKey = "shihusi.theme";
  const root = document.documentElement;
  let preference;
  let toggle;

  function showTheme() {
    const night = preference === "night";
    root.dataset.theme = night ? "night" : "day";
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(night));
      toggle.title = night ? "Switch to day mode" : "Switch to night mode";
    }
  }

  // Read before the stylesheets load so navigation opens in the chosen mode.
  try {
    preference = localStorage.getItem(storageKey);
  } catch {
    // Private browsing can disable storage.
  }
  showTheme();

  document.addEventListener("DOMContentLoaded", () => {
    toggle = document.querySelector(".theme-toggle");
    showTheme();
    toggle.addEventListener("click", () => {
      preference = root.dataset.theme === "night" ? null : "night";
      showTheme();
      try {
        if (preference) localStorage.setItem(storageKey, preference);
        else localStorage.removeItem(storageKey);
      } catch {
        // Storage can be disabled. The switch still works for this page.
      }
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) {
      preference = event.newValue;
      showTheme();
    }
  });
})();
