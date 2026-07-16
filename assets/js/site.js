(function () {
  var menuButton = document.querySelector(".menu-icon");
  var menu = document.querySelector(".menu");

  if (menuButton && menu) {
    menuButton.addEventListener("click", function () {
      var expanded = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!expanded));
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.focus();
      }
    });
  }

  var wechatLink = document.getElementById("wechat-link");
  var wechatWidget = document.getElementById("wechat-widget");

  if (!wechatLink || !wechatWidget) {
    return;
  }

  function moveWidget(event) {
    wechatWidget.style.left = (event.pageX - 25) + "px";
    wechatWidget.style.top = (event.pageY - wechatWidget.offsetHeight - 60) + "px";
  }

  wechatLink.addEventListener("mouseenter", function (event) {
    wechatWidget.style.display = "block";
    moveWidget(event);
  });
  wechatLink.addEventListener("mousemove", moveWidget);
  wechatLink.addEventListener("mouseleave", function () {
    wechatWidget.style.display = "none";
  });
}());
