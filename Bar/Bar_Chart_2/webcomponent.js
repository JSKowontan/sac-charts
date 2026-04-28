(function () {
    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; font-family: "Segoe UI", Arial, sans-serif; }
            #container { 
                position: relative; width: 100%; height: 100%; 
                display: flex; flex-direction: column; background: #fff; box-sizing: border-box;
            }
            #main-area { display: flex; flex: 1; position: relative; overflow: hidden; padding-top: 10px; }
            
            /* Y-Axis Labeling */
            #y-axis { width: 50px; position: relative; display: none; margin-right: 5px; }
            .y-tick { 
                position: absolute; right: 5px; transform: translateY(-50%);
                font-size: 11px; color: #888; text-align: right; width: 100%;
            }

            /* Chart Area */
            #chart-frame { flex: 1; position: relative; border-left: 1px solid #ccc; overflow: hidden; }
            #grid-layer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; }
            .grid-line { position: absolute; left: 0; right: 0; height: 1px; background: #e4e6e9; }
            .zero-line { background: #7f8c8d; height: 2px; z-index: 2; }

            #bars-layer { 
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                display: flex; align-items: flex-start; justify-content: flex-start; gap: 8px; padding: 0 10px;
            }

            .bar-slot { height: 100%; position: relative; display: flex; justify-content: center; }
            .bar { 
                position: absolute; cursor: pointer; transition: border-color 0.1s; 
                box-sizing: border-box; border: 2px solid transparent; 
            }
            .bar:hover { border-color: #3b76c4; z-index: 10; }

            /* X-Axis Labels */
            #x-axis { height: 30px; display: none; align-items: center; gap: 8px; font-size: 11px; color: #666; overflow: hidden; }
            .x-label { text-align: center; white-space: nowrap; }

            /* Legend */
            #legend { height: 40px; display: flex; justify-content: center; align-items: center; gap: 24px; font-size: 12px; border-top: 1px solid #f0f0f0; }
            .legend-item { display: flex; align-items: center; gap: 8px; }
            .legend-box { width: 16px; height: 16px; border-radius: 1px; }

            /* Tooltip */
            #tooltip {
                position: absolute; display: none; background: white; border: 1px solid #c8ced5;
                border-radius: 8px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000; pointer-events: none; min-width: 200px; line-height: 1.4;
            }
            .tt-measure { color: #5c6d82; font-size: 13px; }
            .tt-value { font-size: 18px; font-weight: bold; color: #1c2d42; border-bottom: 1px solid #ebedf0; padding: 4px 0 10px; margin-bottom: 10px; }
            .tt-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
            .tt-data { font-weight: bold; text-align: right; margin-left: 20px; }
        </style>
        <div id="container">
            <div id="main-area">
                <div id="y-axis"></div>
                <div id="chart-frame">
                    <div id="grid-layer"></div>
                    <div id="bars-layer"></div>
                </div>
            </div>
            <div id="x-axis"></div>
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

        formatValue(val) {
            const num = parseFloat(val);
            const abs = Math.abs(num);
            let suffix = "";
            let scale = 1;

            if (abs >= 1e12) { scale = 1e12; suffix = " Trillion"; }
            else if (abs >= 1e9) { scale = 1e9; suffix = " Billion"; }
            else if (abs >= 1e6) { scale = 1e6; suffix = " Million"; }
            else if (abs >= 1e3) { scale = 1e3; suffix = " Thousand"; }

            const formatted = (num / scale).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return formatted + suffix;
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            this._props = { ...this._props, ...changedProperties };
            this.render();
        }

        setChartData(data) {
            // Validation: Do not plot if incomplete
            if (!data || data.length === 0) {
                this._data = [];
            } else {
                const isValid = data.every(d => d.year && d.period && d.indicator && d.value !== undefined);
                this._data = isValid ? data : [];
            }
            this.render();
        }

        render() {
            const { showVerticalAxis, showHorizontalAxis, showGridlines, showLegend, barWidth, colorLY, colorCY, measureName } = this._props;
            const container = this._shadowRoot.getElementById("container");
            const yAxis = this._shadowRoot.getElementById("y-axis");
            const xAxis = this._shadowRoot.getElementById("x-axis");
            const gridLayer = this._shadowRoot.getElementById("grid-layer");
            const barsLayer = this._shadowRoot.getElementById("bars-layer");
            const legend = this._shadowRoot.getElementById("legend");
            const tooltip = this._shadowRoot.getElementById("tooltip");

            // Clear areas
            yAxis.innerHTML = xAxis.innerHTML = gridLayer.innerHTML = barsLayer.innerHTML = legend.innerHTML = "";
            
            if (!this._data.length) return;

            // 1. Calculate Data Range for Bipolar Axis
            const vals = this._data.map(d => parseFloat(d.value));
            let max = Math.max(0, ...vals);
            let min = Math.min(0, ...vals);
            if (max === 0 && min === 0) max = 10; // Fallback
            
            const range = (max - min) * 1.1; // 10% padding
            const topLimit = max + (range * 0.05);
            const bottomLimit = min - (range * 0.05);
            const totalRange = topLimit - bottomLimit;
            const zeroPos = ((topLimit) / totalRange) * 100;

            // 2. Ticks & Gridlines (Always show high, low, zero)
            const ticks = Array.from(new Set([topLimit, 0, bottomLimit, topLimit/2, bottomLimit/2])).sort((a,b) => b-a);
            
            yAxis.style.display = showVerticalAxis ? "block" : "none";
            ticks.forEach(t => {
                const pos = ((topLimit - t) / totalRange) * 100;
                if (showVerticalAxis) {
                    const tick = document.createElement("div");
                    tick.className = "y-tick";
                    tick.style.top = `${pos}%`;
                    tick.innerText = Math.round(t);
                    yAxis.appendChild(tick);
                }
                if (showGridlines) {
                    const line = document.createElement("div");
                    line.className = `grid-line ${t === 0 ? 'zero-line' : ''}`;
                    line.style.top = `${pos}%`;
                    gridLayer.appendChild(line);
                }
            });

            // 3. Render Bars & X-Axis
            xAxis.style.display = showHorizontalAxis ? "flex" : "none";
            xAxis.style.paddingLeft = showVerticalAxis ? "60px" : "10px";

            this._data.forEach(d => {
                const val = parseFloat(d.value);
                const heightPct = (Math.abs(val) / totalRange) * 100;
                
                const slot = document.createElement("div");
                slot.className = "bar-slot";
                slot.style.width = `${barWidth}px`;

                const bar = document.createElement("div");
                bar.className = "bar";
                bar.style.width = "100%";
                bar.style.height = `${heightPct}%`;
                bar.style.backgroundColor = d.indicator === "LY" ? colorLY : colorCY;
                
                if (val >= 0) {
                    bar.style.top = `${zeroPos - heightPct}%`;
                } else {
                    bar.style.top = `${zeroPos}%`;
                }

                // Interactions
                bar.onmouseenter = (e) => {
                    tooltip.style.display = "block";
                    tooltip.innerHTML = `
                        <div class="tt-measure">${measureName}</div>
                        <div class="tt-value">${d.currency || ''}${this.formatValue(d.value)}</div>
                        <div class="tt-row"><span>Calendar Year</span><span class="tt-data">${d.year}</span></div>
                        <div class="tt-row"><span>Calendar Month</span><span class="tt-data">${d.period}</span></div>
                        <div class="tt-row"><span>Year Indicator</span><span class="tt-data">${d.indicator}</span></div>
                    `;
                };
                bar.onmousemove = (e) => {
                    const rect = container.getBoundingClientRect();
                    let x = e.clientX - rect.left + 15;
                    let y = e.clientY - rect.top - tooltip.offsetHeight - 15;
                    
                    // Stay inside container bounds
                    if (x + tooltip.offsetWidth > rect.width) x = e.clientX - rect.left - tooltip.offsetWidth - 15;
                    if (y < 0) y = e.clientY - rect.top + 15;
                    
                    tooltip.style.left = `${x}px`;
                    tooltip.style.top = `${y}px`;
                };
                bar.onmouseleave = () => tooltip.style.display = "none";

                slot.appendChild(bar);
                barsLayer.appendChild(slot);

                if (showHorizontalAxis) {
                    const label = document.createElement("div");
                    label.className = "x-label";
                    label.style.width = `${barWidth}px`;
                    label.innerText = d.period;
                    xAxis.appendChild(label);
                }
            });

            // 4. Legend
            legend.style.display = showLegend ? "flex" : "none";
            if (showLegend) {
                legend.innerHTML = `
                    <div class="legend-item"><div class="legend-box" style="background:${colorLY}"></div>LY</div>
                    <div class="legend-item"><div class="legend-box" style="background:${colorCY}"></div>CY</div>
                `;
            }
        }
    }
    customElements.define("custom-bar-chart", CustomBarChart);

    // --- Builder Panel ---
    class Builder extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.innerHTML = `
                <style>
                    .p { padding: 15px; display: flex; flex-direction: column; gap: 12px; font-family: sans-serif; font-size: 13px; }
                    .r { display: flex; align-items: center; gap: 8px; cursor: pointer; }
                    .f { display: flex; flex-direction: column; gap: 4px; }
                    label { font-weight: bold; color: #444; }
                    input { padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
                </style>
                <div class="p">
                    <label class="r"><input type="checkbox" id="v_ax"> Vertical Axis Labels</label>
                    <label class="r"><input type="checkbox" id="h_ax"> Horizontal Axis Labels</label>
                    <label class="r"><input type="checkbox" id="grid"> Horizontal Gridlines</label>
                    <label class="r"><input type="checkbox" id="leg"> Show Legend</label>
                    <div class="f"><label>Measure Name</label><input type="text" id="m_nm"></div>
                    <div class="f"><label>LY Color</label><input type="color" id="c_ly"></div>
                    <div class="f"><label>CY Color</label><input type="color" id="c_cy"></div>
                    <div class="f"><label>Bar Width (px)</label><input type="number" id="b_w"></div>
                </div>
            `;
            this._shadowRoot.querySelectorAll("input").forEach(i => i.addEventListener("change", () => this.dispatch()));
        }
        dispatch() {
            this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties: {
                showVerticalAxis: this._shadowRoot.getElementById("v_ax").checked,
                showHorizontalAxis: this._shadowRoot.getElementById("h_ax").checked,
                showGridlines: this._shadowRoot.getElementById("grid").checked,
                showLegend: this._shadowRoot.getElementById("leg").checked,
                measureName: this._shadowRoot.getElementById("m_nm").value,
                colorLY: this._shadowRoot.getElementById("c_ly").value,
                colorCY: this._shadowRoot.getElementById("c_cy").value,
                barWidth: parseInt(this._shadowRoot.getElementById("b_w").value)
            }}}));
        }
        set settings(s) {
            this._shadowRoot.getElementById("v_ax").checked = s.showVerticalAxis;
            this._shadowRoot.getElementById("h_ax").checked = s.showHorizontalAxis;
            this._shadowRoot.getElementById("grid").checked = s.showGridlines;
            this._shadowRoot.getElementById("leg").checked = s.showLegend;
            this._shadowRoot.getElementById("m_nm").value = s.measureName;
            this._shadowRoot.getElementById("c_ly").value = s.colorLY;
            this._shadowRoot.getElementById("c_cy").value = s.colorCY;
            this._shadowRoot.getElementById("b_w").value = s.barWidth;
        }
    }
    customElements.define("custom-bar-chart-builder", Builder);
})();
