export function renderSidebar(root, model, actions) {
  root.innerHTML = `
    <section class="section">
      <h2>What this atlas is showing</h2>
      <p class="section-copy">
        Every live overlay is now gated by the Davidson County boundary first,
        then filtered to keep the focus on Metro-scale streets instead of
        interstate and state highway corridors. The highest-ranked crash areas
        are also highlighted directly on the map.
      </p>
      <div class="mini-grid">
        ${model.summaryCards
          .map(
            (card) => `
              <article class="metric-card">
                <strong>${card.value}</strong>
                <span>${card.label}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <h2>Layer controls</h2>
      <div class="toggle-list">
        ${model.layerControls
          .map(
            (layer) => `
              <label class="toggle-item">
                <div class="toggle-copy">
                  <strong>${layer.label}</strong>
                  <span>${layer.description}</span>
                </div>
                <input
                  class="switch"
                  type="checkbox"
                  data-layer-toggle="${layer.key}"
                  ${layer.enabled ? "checked" : ""}
                />
              </label>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <h2>Data status</h2>
      <div class="pill-row">
        ${model.statusChips
          .map(
            (chip) => `
              <div class="pill">
                <span>${chip.label}</span>
                <strong>${chip.value}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="chip-row">
        ${model.statusDetails
          .map(
            (detail) => `
              <span class="status-chip ${detail.className}">${detail.label}</span>
            `,
          )
          .join("")}
      </div>
      <p class="small-note" style="margin-top: 12px;">${model.statusCopy}</p>
    </section>

    <section class="section">
      <h2>Metro intersections</h2>
      <div class="list-stack">
        ${model.intersections
          .map(
            (intersection) => `
              <button
                class="list-card ${intersection.selected ? "is-selected" : ""}"
                data-intersection-id="${intersection.id}"
              >
                <strong>${intersection.name}</strong>
                <span>${intersection.emphasis}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <h2>Top crash-ranked areas</h2>
      <div class="list-stack">
        ${model.crashAreas.length
          ? model.crashAreas
              .map(
                (area) => `
                  <button
                    class="list-card ${area.selected ? "is-selected" : ""}"
                    data-crash-area-id="${area.id}"
                  >
                    <strong>${area.name}</strong>
                    <span>Official crash-area cell from the Nashville MPO service.</span>
                    <div class="chip-row">
                      <span class="chip">${area.scoreLabel ?? (area.score != null ? `${area.score}/100` : "n/a")}</span>
                    </div>
                  </button>
                `,
              )
              .join("")
          : '<div class="list-card"><strong>Waiting on live data</strong><span>The top crash-area list will populate when the MPO service responds.</span></div>'}
      </div>
    </section>

    <section class="section">
      <h2>Source trail</h2>
      <div class="link-list">
        ${model.sources
          .map(
            (source) => `
              <a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>
            `,
          )
          .join("")}
      </div>
      <p class="small-note" style="margin-top: 12px;">
        The crash, traffic, transit, and sidewalk layers are county-filtered overlays.
      </p>
    </section>
  `;

  root.querySelectorAll("[data-layer-toggle]").forEach((input) => {
    input.addEventListener("change", (event) => {
      actions.toggleLayer(event.currentTarget.dataset.layerToggle);
    });
  });

  root.querySelectorAll("[data-intersection-id]").forEach((button) => {
    button.addEventListener("click", () => {
      actions.selectIntersection(button.dataset.intersectionId);
    });
  });

  root.querySelectorAll("[data-crash-area-id]").forEach((button) => {
    button.addEventListener("click", () => {
      actions.selectCrashArea(Number(button.dataset.crashAreaId));
    });
  });
}
