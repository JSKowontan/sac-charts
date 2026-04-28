(function () {
    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { 
                display: block; width: 100%; height: 100%; 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                overflow: visible; 
            }
            #widget-container { 
                display: flex; flex-direction: column; width: 100%; height: 100%; 
                background: transparent; position: relative; overflow: visible;
            }
            #main-layout { display: flex; flex: 1; position: relative; overflow: visible; }
            
            #y-axis { width: 50px; position: relative; display: none; flex-shrink: 0; }
            .y-label { 
                position: absolute; right: 8px; transform: translateY(-50%);
                font-size: 11px; color: #666; white-space: nowrap;
            }

            #chart-area { flex: 1; position: relative; overflow: visible; }
            #grid-layer { position: absolute; inset: 0; pointer-events: none; }
            .grid-line { position: absolute; left: 0; right: 0; height: 1px; background: #e4e6e9; }
            .zero-line { background: #7f8c8d; height: 1.5px; z-index: 2; }

            #bars-layer { 
                position: absolute; inset: 0; display: flex; align-items: flex-start; 
                justify-content: flex-start; gap: 12px; padding: 0 10px;
            }
            .bar-slot { height: 100%; position: relative; display: flex; justify-content: center; align-items: center; }
            
            .bar { 
                position: absolute; cursor: pointer; transition: filter 0.2s;
                box-sizing: border-box; border: 1px solid transparent;
            }
            .bar:hover { filter: brightness(0.9); border-color: rgba(0,0,0,0.1); z-index: 100; }
            
            /* CY sits on top by default in DOM order, but we can explicit z-index if needed */
            .bar-cy { z-index: 5; }
            .bar-ly { z-index: 1; }

            #x-axis { height: 25px; display: none; align-items: center; gap: 12px; font-size: 10px; color: #666; margin-top: 4px; }
            .x-label { text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            #legend { height: 35px; display: none; justify-content: center; align-items: center; gap: 20px; font-size: 12px; color: #444; }
            .legend-item { display: flex; align-items: center; gap: 6px; }
            .legend-box { width: 12px; height: 12px; }

            #tooltip {
                position: fixed; display: none; background: white; border: 1px solid #c8ced5;
                border-radius: 6px; padding: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                z-index: 2147483647; pointer-events: none; min-width: 200px; line-height: 1.4;
            }
            .tt-measure { color: #5c6d82; font-size: 12px; margin-bottom: 2px; }
            .tt-value { font-size: 18px; font-weight: bold; color: #1c2d42; border-bottom: 1px solid #ebedf0; padding-bottom: 8px; margin-bottom: 8px; }
            .tt-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; }
            .tt-data { font-weight: bold; text-align: right; margin-left: 15px; }
        </style>
        <div id="widget-container">
            <div id="main-layout">
                <div id="y-axis"></div>
                <div id="chart-area">
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

        formatValue(val, isAxis = false) {
            const num = parseFloat(val);
            const absNum = Math.abs(num);
            let suffix = "";
            let divider = 1;
            if (absNum >= 1e12) { divider = 1e12; suffix = isAxis ? "T" : " Trillion"; }
            else if (absNum >= 1e9) { divider = 1e9; suffix = isAxis ? "B" : " Billion"; }
            else if (absNum >= 1e6) { divider = 1e6; suffix = isAxis ? "M" : " Million"; }
            else if (absNum >= 1e3) { divider = 1e3; suffix = isAxis ? "K" : " Thousand"; }
            return (num / divider).toFixed(2).replace(/\.00$/, "") + suffix;
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            this._props = { ...this._props, ...changedProperties };
            this.render();
        }

        setChartData(data) {
            if (!data || data.length === 0) {
                this._data = [];
            } else {
                this._data = data;
            }
            this.render();
        }

        render() {
            const { showVerticalAxis, showHorizontalAxis, showGridlines, showLegend, barWidth, colorLY, colorCY, measureName } = this._props;
            const container = this._shadowRoot.getElementById("widget-container");
            const yAxis = this._shadowRoot.getElementById("y-axis");
            const xAxis = this._shadowRoot.getElementById("x-axis");
            const gridLayer = this._shadowRoot.getElementById("grid-layer");
            const barsLayer = this._shadowRoot.getElementById("bars-layer");
            const legend = this._shadowRoot.getElementById("legend");
            const tooltip = this._shadowRoot.getElementById("tooltip");

            yAxis.innerHTML = xAxis.innerHTML = gridLayer.innerHTML = barsLayer.innerHTML = legend.innerHTML = "";
            yAxis.style.display = showVerticalAxis ? "block" : "none";
            xAxis.style.display = showHorizontalAxis ? "flex" : "none";
            legend.style.display = showLegend ? "flex" : "none";

            if (this._data.length === 0) return;

            // Group data by period to handle overlapping pairs
            const grouped = {};
            this._data.forEach(d => {
                const key = d.period;
                if (!grouped[key]) grouped[key] = { period: key, LY: null, CY: null };
                grouped[key][d.indicator] = d;
            });
            const periods = Object.values(grouped);

            const vals = this._data.map(d => parseFloat(d.value));
            const maxVal = Math.max(0, ...vals);
            const minVal = Math.min(0, ...vals);
            const dataRange = (maxVal - minVal) || 1;
            const zeroPosPct = (maxVal / dataRange) * 100;

            // Ticks
            const ticks = [...new Set([maxVal, 0, minVal, maxVal/2, minVal/2])].sort((a,b) => b-a);
            ticks.forEach(t => {
                const pos = ((maxVal - t) / dataRange) * 100;
                if (showVerticalAxis) {
                    const lbl = document.createElement("div");
                    lbl.className = "y-label";
                    lbl.style.top = `${pos}%`;
                    lbl.innerText = this.formatValue(t, true);
                    yAxis.appendChild(lbl);
                }
                if (showGridlines) {
                    const line = document.createElement("div");
                    line.className = `grid-line ${t === 0 ? 'zero-line' : ''}`;
                    line.style.top = `${pos}%`;
                    gridLayer.appendChild(line);
                }
            });

            xAxis.style.paddingLeft = showVerticalAxis ? "60px" : "10px";

            periods.forEach(group => {
                const slot = document.createElement("div");
                slot.className = "bar-slot";
                slot.style.width = `${barWidth}px`;

                const createBar = (d, type) => {
                    if (!d) return;
                    const val = parseFloat(d.value);
                    const heightPct = (Math.abs(val) / dataRange) * 100;
                    const bar = document.createElement("div");
                    bar.className = `bar bar-${type.toLowerCase()}`;
                    
                    // Width Logic: CY is slightly less than LY (75% of LY width)
                    const width = type === 'CY' ? barWidth * 0.7 : barWidth;
                    bar.style.width = `${width}px`;
                    bar.style.height = `${heightPct}%`;
                    bar.style.backgroundColor = type === 'LY' ? colorLY : colorCY;
                    bar.style.top = val >= 0 ? `${zeroPosPct - heightPct}%` : `${zeroPosPct}%`;

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
                        const ttRect = tooltip.getBoundingClientRect();
                        let x = e.clientX + 15, y = e.clientY - ttRect.height - 15;
                        if (x + ttRect.width > window.innerWidth) x = e.clientX - ttRect.width - 15;
                        if (y < 0) y = e.clientY + 15;
                        tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
                    };
                    bar.onmouseleave = () => tooltip.style.display = "none";
                    return bar;
                };

                // Add LY first (background) then CY (foreground)
                if (group.LY) slot.appendChild(createBar(group.LY, 'LY'));
                if (group.CY) slot.appendChild(createBar(group.CY, 'CY'));

                barsLayer.appendChild(slot);

                if (showHorizontalAxis) {
                    const xLbl = document.createElement("div");
                    xLbl.className = "x-label";
                    xLbl.style.width = `${barWidth}px`;
                    xLbl.innerText = group.period;
                    xAxis.appendChild(xLbl);
                }
            });

            if (showLegend) {
                legend.innerHTML = `
                    <div class="legend-item"><div class="legend-box" style="background:${colorLY}"></div>LY</div>
                    <div class="legend-item"><div class="legend-box" style="background:${colorCY}"></div>CY</div>
                `;
            }
        }
    }
    customElements.define("custom-bar-chart", CustomBarChart);

    // Builder Panel same as before
    class Builder extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.innerHTML = `
                <style>
                    .container { padding: 15px; display: flex; flex-direction: column; gap: 12px; font-family: sans-serif; font-size: 13px; }
                    .prop { display: flex; flex-direction: column; gap: 4px; }
                    .checkbox-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
                    label { font-weight: bold; color: #444; }
                    input[type="text"], input[type="number"] { padding: 6px; border: 1px solid #ccc; border-radius: 4px; }
                </style>
                <div class="container">
                    <label class="checkbox-row"><input type="checkbox" id="v_axis"> Vertical Labels</label>
                    <label class="checkbox-row"><input type="checkbox" id="h_axis"> Horizontal Labels</label>
                    <label class="checkbox-row"><input type="checkbox" id="grid"> Gridlines</label>
                    <label class="checkbox-row"><input type="checkbox" id="leg"> Show Legend</label>
                    <div class="prop"><label>Measure Name</label><input type="text" id="m_name"></div>
                    <div class="prop"><label>LY Color</label><input type="color" id="c_ly"></div>
                    <div class="prop"><label>CY Color</label><input type="color" id="c_cy"></div>
                    <div class="prop"><label>Bar Width (px)</label><input type="number" id="b_width"></div>
                </div>
            `;
            this._shadowRoot.querySelectorAll("input").forEach(i => i.addEventListener("change", () => this.update()));
        }
        update() {
            this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties: {
                showVerticalAxis: this._shadowRoot.getElementById("v_axis").checked,
                showHorizontalAxis: this._shadowRoot.getElementById("h_axis").checked,
                showGridlines: this._shadowRoot.getElementById("grid").checked,
                showLegend: this._shadowRoot.getElementById("leg").checked,
                measureName: this._shadowRoot.getElementById("m_name").value,
                colorLY: this._shadowRoot.getElementById("c_ly").value,
                colorCY: this._shadowRoot.getElementById("c_cy").value,
                barWidth: parseInt(this._shadowRoot.getElementById("b_width").value)
            }}}));
        }
        set settings(s) {
            this._shadowRoot.getElementById("v_axis").checked = s.showVerticalAxis;
            this._shadowRoot.getElementById("h_axis").checked = s.showHorizontalAxis;
            this._shadowRoot.getElementById("grid").checked = s.showGridlines;
            this._shadowRoot.getElementById("leg").checked = s.showLegend;
            this._shadowRoot.getElementById("m_name").value = s.measureName;
            this._shadowRoot.getElementById("c_ly").value = s.colorLY;
            this._shadowRoot.getElementById("c_cy").value = s.colorCY;
            this._shadowRoot.getElementById("b_width").value = s.barWidth;
        }
    }
    customElements.define("custom-bar-chart-builder", Builder);
})();
