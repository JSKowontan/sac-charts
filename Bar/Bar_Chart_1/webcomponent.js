(function () {
    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; font-family: sans-serif; }
            #container { 
                position: relative; width: 100%; height: 100%; 
                display: flex; flex-direction: column; box-sizing: border-box;
            }
            #chart-area { 
                flex: 1; display: flex; align-items: flex-end; justify-content: flex-start;
                gap: 8px; padding: 0 10px; border-bottom: 1px solid #ccc;
            }
            .bar { 
                transition: transform 0.1s; cursor: pointer; 
                box-sizing: border-box; border: 2px solid transparent; 
            }
            .bar:hover { 
                border-color: #34619d; /* Highlighting the edges */
                transform: scaleX(1.05);
            }
            
            /* Legend Styles */
            #legend {
                display: flex; justify-content: center; gap: 20px;
                padding: 15px 0; font-size: 12px; color: #444;
            }
            .legend-item { display: flex; align-items: center; gap: 8px; }
            .legend-box { width: 16px; height: 16px; border-radius: 2px; }

            #axis-labels { 
                height: 25px; align-items: center; font-size: 10px; color: #666;
            }

            /* Tooltip Styles */
            #tooltip {
                position: absolute; display: none; background: white;
                border: 1px solid #d1d9e4; border-radius: 8px;
                padding: 16px; box-shadow: 0 6px 12px rgba(0,0,0,0.15);
                z-index: 9999; pointer-events: none; min-width: 210px;
            }
            .tt-measure { color: #5c6d82; font-size: 13px; margin-bottom: 2px; }
            .tt-value { font-size: 18px; font-weight: bold; color: #1a1a1a; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
            .tt-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
            .tt-label { color: #555; }
            .tt-data { font-weight: bold; color: #1a1a1a; margin-left: 20px; }
        </style>
        <div id="container">
            <div id="chart-area"></div>
            <div id="axis-labels"></div>
            <div id="legend"></div>
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

        // 1. Dynamic Value Formatter
        formatValue(val) {
            const num = parseFloat(val);
            if (isNaN(num)) return "0.00";
            
            const absNum = Math.abs(num);
            if (absNum >= 1e12) return (num / 1e12).toFixed(2) + " Trillion";
            if (absNum >= 1e9)  return (num / 1e9).toFixed(2) + " Billion";
            if (absNum >= 1e6)  return (num / 1e6).toFixed(2) + " Million";
            if (absNum >= 1e3)  return (num / 1e3).toFixed(2) + " Thousand";
            return num.toFixed(2);
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = { ...this._props, ...changedProperties };
        }

        onCustomWidgetAfterUpdate() {
            this.render();
        }

        setChartData(data) {
            this._data = (data && data.length > 0) ? data : [];
            this.render();
        }

        render() {
            const chartArea = this._shadowRoot.getElementById("chart-area");
            const axisArea = this._shadowRoot.getElementById("axis-labels");
            const legendArea = this._shadowRoot.getElementById("legend");
            const tooltip = this._shadowRoot.getElementById("tooltip");
            
            chartArea.innerHTML = "";
            axisArea.innerHTML = "";
            legendArea.innerHTML = "";

            if (this._data.length === 0) return;

            // Render Legend
            if (this._props.showLegend) {
                legendArea.innerHTML = `
                    <div class="legend-item"><div class="legend-box" style="background:${this._props.colorLY}"></div>LY</div>
                    <div class="legend-item"><div class="legend-box" style="background:${this._props.colorCY}"></div>CY</div>
                `;
            }

            const maxValue = Math.max(...this._data.map(d => parseFloat(d.value)));

            this._data.forEach((d) => {
                const bar = document.createElement("div");
                bar.className = "bar";
                bar.style.width = `${this._props.barWidth}px`;
                bar.style.height = `${(parseFloat(d.value) / maxValue) * 90}%`;
                bar.style.backgroundColor = d.indicator === "LY" ? this._props.colorLY : this._props.colorCY;
                
                bar.addEventListener("mouseenter", (e) => {
                    tooltip.style.display = "block";
                    tooltip.innerHTML = `
                        <div class="tt-measure">${this._props.measureName}</div>
                        <div class="tt-value">${d.currency || ''}${this.formatValue(d.value)}</div>
                        <div class="tt-row"><span class="tt-label">Calendar Year</span><span class="tt-data">${d.year}</span></div>
                        <div class="tt-row"><span class="tt-label">Calendar Month</span><span class="tt-data">${d.period}</span></div>
                        <div class="tt-row"><span class="tt-label">Year Indicator</span><span class="tt-data">${d.indicator}</span></div>
                    `;
                });

                bar.addEventListener("mousemove", (e) => {
                    const rect = this._shadowRoot.getElementById("container").getBoundingClientRect();
                    let x = e.clientX - rect.left + 15;
                    let y = e.clientY - rect.top - tooltip.offsetHeight - 15;

                    if (x + tooltip.offsetWidth > rect.width) x = e.clientX - rect.left - tooltip.offsetWidth - 15;
                    if (y < 0) y = e.clientY - rect.top + 15;

                    tooltip.style.left = `${x}px`;
                    tooltip.style.top = `${y}px`;
                });

                bar.addEventListener("mouseleave", () => tooltip.style.display = "none");
                chartArea.appendChild(bar);

                if (this._props.showAxis) {
                    const label = document.createElement("div");
                    label.style.width = `${this._props.barWidth}px`;
                    label.style.textAlign = "center";
                    label.innerText = d.period;
                    axisArea.appendChild(label);
                }
            });

            axisArea.style.display = this._props.showAxis ? "flex" : "none";
        }
    }

    customElements.define("custom-bar-chart", CustomBarChart);

    // BUILDER PANEL
    class CustomBarChartBuilder extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.innerHTML = `
                <style>
                    .builder { padding: 10px; display: flex; flex-direction: column; gap: 10px; font-family: sans-serif; font-size: 13px; }
                    .field { display: flex; flex-direction: column; }
                    .row { display: flex; align-items: center; gap: 10px; }
                </style>
                <div class="builder">
                    <div class="row"><input type="checkbox" id="chk_axis"><label>Show Axis</label></div>
                    <div class="row"><input type="checkbox" id="chk_legend"><label>Show Legend</label></div>
                    <div class="field"><label>Measure Name</label><input type="text" id="txt_measure"></div>
                    <div class="field"><label>LY Color</label><input type="color" id="clr_ly"></div>
                    <div class="field"><label>CY Color</label><input type="color" id="clr_cy"></div>
                    <div class="field"><label>Bar Width (px)</label><input type="number" id="num_width"></div>
                </div>
            `;

            this._shadowRoot.querySelectorAll("input").forEach(i => {
                i.addEventListener("change", () => {
                    this.dispatchEvent(new CustomEvent("propertiesChanged", {
                        detail: { properties: {
                            showAxis: this._shadowRoot.getElementById("chk_axis").checked,
                            showLegend: this._shadowRoot.getElementById("chk_legend").checked,
                            measureName: this._shadowRoot.getElementById("txt_measure").value,
                            colorLY: this._shadowRoot.getElementById("clr_ly").value,
                            colorCY: this._shadowRoot.getElementById("clr_cy").value,
                            barWidth: parseInt(this._shadowRoot.getElementById("num_width").value)
                        }}
                    }));
                });
            });
        }

        set settings(s) {
            this._shadowRoot.getElementById("chk_axis").checked = s.showAxis;
            this._shadowRoot.getElementById("chk_legend").checked = s.showLegend;
            this._shadowRoot.getElementById("txt_measure").value = s.measureName;
            this._shadowRoot.getElementById("clr_ly").value = s.colorLY;
            this._shadowRoot.getElementById("clr_cy").value = s.colorCY;
            this._shadowRoot.getElementById("num_width").value = s.barWidth;
        }
    }
    customElements.define("custom-bar-chart-builder", CustomBarChartBuilder);
})();
