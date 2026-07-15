(() => {
  const params = new URLSearchParams(location.search);
  const empty = params.get("state") === "empty";
  const beta = params.get("flag") === "beta";
  const app = document.querySelector("#app");
  const auth = document.querySelector("#auth");
  const roleStatus = document.querySelector("#role-status");
  const menu = document.querySelector("#workspace-menu");
  const menuButton = document.querySelector("#unstable-menu");
  menuButton.id = `menu-${crypto.getRandomValues(new Uint32Array(1))[0]}`;

  document.querySelector("#empty-state").hidden = !empty;
  document.querySelector("#populated-state").hidden = empty;
  document.querySelector("#feature-state").textContent = beta ? "Beta insights enabled" : "Standard insights";

  document.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => {
    const role = button.dataset.role;
    auth.hidden = true;
    app.hidden = false;
    roleStatus.textContent = `Signed in as ${role}`;
    document.querySelector("#admin-zone").hidden = role !== "admin";
  }));

  menuButton.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".panel").forEach((panel) => { panel.hidden = panel.id !== button.dataset.panel; });
    document.querySelector("#breadcrumb").textContent = button.textContent;
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }));
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[role=tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button)));
    document.querySelector("#overview").hidden = button.dataset.tab !== "overview";
    document.querySelector("#activity").hidden = button.dataset.tab !== "activity";
  }));

  let page = 1;
  document.querySelector("#next-page").addEventListener("click", () => {
    page = Math.min(3, page + 1);
    document.querySelector("#page-label").textContent = `Page ${page} of 3`;
    renderVirtualRows(page * 10);
  });
  const list = document.querySelector("#virtual-list");
  function renderVirtualRows(offset) {
    list.replaceChildren(...Array.from({ length: 12 }, (_, index) => {
      const row = document.createElement("div");
      row.className = "virtual-row";
      row.textContent = `Synthetic project ${offset + index + 1}`;
      return row;
    }));
  }
  renderVirtualRows(0);
  list.addEventListener("scroll", () => renderVirtualRows(Math.floor(list.scrollTop / 46)));

  const dialog = document.querySelector("#details-modal");
  document.querySelector("#open-modal").addEventListener("click", () => dialog.showModal());
  document.querySelector("#close-modal").addEventListener("click", () => dialog.close());

  document.querySelector("#load-delayed").addEventListener("click", () => {
    const status = document.querySelector("#report-status");
    status.textContent = "Loading synthetic report";
    setTimeout(() => { status.textContent = "Delayed report loaded"; }, 450);
  });
  document.querySelector("#load-error").addEventListener("click", () => {
    document.querySelector("#report-status").textContent = "Recoverable report error";
    document.querySelector("#retry-report").hidden = false;
  });
  document.querySelector("#retry-report").addEventListener("click", () => {
    document.querySelector("#report-status").textContent = "Report recovered";
    document.querySelector("#retry-report").hidden = true;
  });

  document.querySelector("#form-next").addEventListener("click", () => {
    document.querySelector("#form-step-1").hidden = true;
    document.querySelector("#form-step-2").hidden = false;
  });
  document.querySelector("#profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    document.querySelector("#form-result").textContent = "Demo draft saved";
  });
  document.querySelector("#fixture-upload").addEventListener("change", (event) => {
    document.querySelector("#form-result").textContent = event.target.files.length ? "Synthetic upload selected" : "No upload selected";
  });

  document.querySelectorAll("[data-danger]").forEach((button) => button.addEventListener("click", async () => {
    await fetch(`/__danger/${encodeURIComponent(button.dataset.danger)}`, { method: "POST" });
    if (button.dataset.danger === "popup") window.open("https://example.invalid/popup-trap", "capture-trap");
  }));
})();
