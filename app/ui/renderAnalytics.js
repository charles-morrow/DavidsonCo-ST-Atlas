export function renderAnalytics(root, model) {
  root.innerHTML = `
    <div class="analytics-layout">
      <section class="metrics-grid">
        ${model.metricCards
          .map(
            (card) => `
              <article class="metric-card">
                <strong>${card.value}</strong>
                <span>${card.label}</span>
              </article>
            `,
          )
          .join("")}
      </section>

      <section class="analytics-grid">
        <article class="analytics-card">
          <h3>Local crash intensity</h3>
          <div class="bar-list">
            ${model.corridorBars
              .map(
                (row) => `
                  <div class="bar-row">
                    <header>
                      <strong>${row.name}</strong>
                      <span>${row.scoreLabel}</span>
                    </header>
                    <div class="bar-track">
                      <div class="bar-fill" style="width: ${row.score}%;"></div>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="analytics-card">
          <h3>Mobility context snapshot</h3>
          <div class="table-list">
            ${model.mobilityRows
              .map(
                (row) => `
                  <div class="table-row">
                    <div>
                      <strong>${row.label}</strong>
                      <span>${row.detail}</span>
                    </div>
                    <strong>${row.value}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="analytics-card">
          <h3>Intersection watchlist</h3>
          <div class="table-list">
            ${model.intersectionRows
              .map(
                (row) => `
                  <div class="table-row">
                    <div>
                      <strong>${row.name}</strong>
                      <span>${row.detail}</span>
                    </div>
                    <strong>${row.modes}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="analytics-card">
          <h3>Reading the network</h3>
          <p>${model.narrative}</p>
        </article>
      </section>
    </div>
  `;
}
