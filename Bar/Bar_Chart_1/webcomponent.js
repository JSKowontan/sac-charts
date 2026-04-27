(function () {
    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            #container { 
                position: relative; width: 100%; height: 100%; 
                display: flex; flex-direction: column; box-sizing: border-box;
                border-bottom: 1px solid #ccc;
            }
            #chart-area { 
                flex: 1; display: flex; align-items: flex-end; justify-content: flex-start;
                gap: 8px; padding: 0 10px; position: relative;
            }
            .bar { transition: opacity 0.2s; cursor: pointer; position: relative; }
            .bar:hover { opacity: 0.8; }
            
            #axis-labels { 
                display: none; height: 30px; align-items: center; 
                border-top: 1px solid #eee; font-size: 10px; color: #666;
            }
            
            /* Tooltip Styles */
            #tooltip {
                position: absolute; display: none; background: white;
                border: 1px solid #d1d9e4; border-radius: 8px;
                padding: 16px; box-shadow: 0 6px 12px rgba(0,0,0,0.15);
                z-index: 9999; pointer-events: none; min-width: 200px;
                line-height: 1.4;
            }
            .tt-measure { color: #5c6d82; font-size: 14px; margin-bottom: 4px; }
            .tt-value { font-size: 18px; font-weight: 700; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px; }
            .tt-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
            .tt-label { color: #333; }
            .tt-data { font-weight: 600; color: #333; text-align: right; margin-left: 20px;}
        </style>
        <div id="container">
            <div id="chart-area"></div>
            <div id="axis-labels"></div>
            <div id="tooltip"></div>
        </div>
    `;

    class CustomBarChart extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));
            this._props = {};
            this._data = [];
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = { ...this._props, ...changedProperties };
        }

        onCustomWidgetAfterUpdate() {
            this.render();
        }

        setChartData(data) {
            // Validate data completeness
            if (!data || !Array.isArray(data) || data.length === 0) {
                this._data = [];
            } else {
                const isValid = data.every(d => d.year && d.period && d.indicator && d.value);
                this._data = isValid ? data : [];
            }
            this.render();
        }

        render() {
            const chartArea = this._shadowRoot.getElementById("chart-area");
            const axisArea = this._shadowRoot.getElementById("axis-labels");
            const tooltip = this._shadowRoot.getElementById("tooltip");
            
            chartArea.innerHTML = "";
            axisArea.innerHTML = "";
            axisArea.style.display = this._props.showAxis ? "flex" : "none";

            if (this._data.length === 0) return;

            const maxValue = Math.max(...this._data.map(d => parseFloat(d.value)));

            this._data.forEach((d, index) => {
                // Create Bar
                const bar = document.createElement("div");
                bar.className = "bar";
                bar.style.width = `${this._props.barWidth}px`;
                const heightPercent = (parseFloat(d.value) / maxValue) * 90; // scale to 90% height
                bar.style.height = `${heightPercent}%`;
                bar.style.backgroundColor = d.indicator === "LY" ? this._props.colorLY : this._props.colorCY;
                
                // Tooltip Interaction
                bar.addEventListener("mouseenter", (e) => this.showTooltip(e, d));
                bar.addEventListener("mousemove", (e) => this.moveTooltip(e));
                bar.addEventListener("mouseleave", () => tooltip.style.display = "none");

                chartArea.appendChild(bar);

                // Create Axis Labels if enabled
                if (this._props.showAxis) {
                    const label = document.createElement("div");
                    label.style.width = `${this._props.barWidth}px`;
                    label.style.textAlign = "center";
                    label.innerText = d.period;
                    axisArea.appendChild(label);
                }
            });
        }

        showTooltip(e, data) {
            const tooltip = this._shadowRoot.getElementById("tooltip");
            tooltip.style.display = "block";
            tooltip.innerHTML = `
                <div class="tt-measure">${this._props.measureName}</div>
                <div class="tt-value">${data.currency || ''}${data.value} Billion</div>
                <div class="tt-row"><span class="tt-label">Calendar Year</span><span class="tt-data">${data.year}</span></div>
                <div class="tt-row"><span class="tt-label">Calendar Month</span><span class="tt-data">${data.period}</span></div>
                <div class="tt-row"><span class="tt-label">Year Indicator</span><span class="tt-data">${data.indicator}</span></div>
            `;
        }

        moveTooltip(e) {
            const tooltip = this._shadowRoot.getElementById("tooltip");
            const container = this._shadowRoot.getElementById("container");
            const rect = container.getBoundingClientRect();

            let x = e.clientX - rect.left + 15;
            let y = e.clientY - rect.top - tooltip.offsetHeight - 15;

            // Collision detection (keep inside chart area)
            if (x + tooltip.offsetWidth > rect.width) {
                x = e.clientX - rect.left - tooltip.offsetWidth - 15;
            }
            if (y < 0) {
                y = e.clientY - rect.top + 15;
            }

            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        }
    }

    customElements.define("custom-bar-chart", CustomBarChart);

    // BUILDER PANEL CODE
    let builderTemplate = document.createElement("template");
    builderTemplate.innerHTML = `
        <style>
            .builder-container { padding: 15px; display: flex; flex-direction: column; gap: 12px; font-family: sans-serif; font-size: 13px; }
            .field { display: flex; flex-direction: column; gap: 4px; }
            label { font-weight: bold; color: #444; }
            input { padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
            .checkbox-field { flex-direction: row; align-items: center; gap: 8px; }
        </style>
        <div class="builder-container">
            <div class="field checkbox-field">
                <input type="checkbox" id="prop_showAxis">
                <label for="prop_showAxis">Show Axis Labels</label>
            </div>
            <div class="field">
                <label>Measure Name</label>
                <input type="text" id="prop_measureName">
            </div>
            <div class="field">
                <label>LY Bar Color</label>
                <input type="color" id="prop_colorLY">
            </div>
            <div class="field">
                <label>CY Bar Color</label>
                <input type="color" id="prop_colorCY">
            </div>
            <div class="field">
                <label>Bar Width (px)</label>
                <input type="number" id="prop_barWidth">
            </div>
        </div>
    `;

    class CustomBarChartBuilder extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(builderTemplate.content.cloneNode(true));
            this._shadowRoot.querySelectorAll("input").forEach(i => {
                i.addEventListener("change", (e) => {
                    const key = e.target.id.replace("prop_", "");
                    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
                    this.dispatchEvent(new CustomEvent("propertiesChanged", {
                        detail: { properties: { [key]: value } }
                    }));
                });
            });
        }

        set settings(s) {
            this._shadowRoot.getElementById("prop_showAxis").checked = s.showAxis;
            this._shadowRoot.getElementById("prop_measureName").value = s.measureName;
            this._shadowRoot.getElementById("prop_colorLY").value = s.colorLY;
            this._shadowRoot.getElementById("prop_colorCY").value = s.colorCY;
            this._shadowRoot.getElementById("prop_barWidth").value = s.barWidth;
        }
    }

    customElements.define("custom-bar-chart-builder", CustomBarChartBuilder);
})();
