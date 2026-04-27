(function () {
    let template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display: block; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            #container { 
                position: relative; width: 100%; height: 100%; 
                display: flex; flex-direction: column; box-sizing: border-box;
                /*border-bottom: 1px solid #ccc;*/
            }

            /* Y-Axis Column */
            #y-axis { width: 45px; position: relative; display: none; }
            .y-tick { 
                position: absolute; right: 8px; transform: translateY(50%);
                font-size: 11px; color: #888; text-align: right; width: 100%;
            }

            #chart-container { flex: 1; position: relative; border-left: 1px solid #ccc; }
            #grid-layer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; }
            .grid-line { position: absolute; left: 0; right: 0; height: 1px; background: #e4e6e9; }
            .zero-line { background: #7f8c8d; height: 2px; z-index: 2; }

            #bars-layer { 
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                display: flex; align-items: flex-start; justify-content: flex-start; gap: 8px; padding: 0 10px;
            }

            .bar-wrapper { height: 100%; position: relative; display: flex; align-items: center; justify-content: center; }
            .bar { 
                position: absolute; cursor: pointer; transition: border-color 0.1s; 
                box-sizing: border-box; border: 2px solid transparent; 
            }

            .bar { transition: opacity 0.2s; cursor: pointer; position: relative; }
            
            .bar:hover { 
                border-color: #3b76c4; /* Highlighting the edges */ 
            }
            
            #axis-labels { 
                display: none; height: 30px; align-items: center; 
                border-top: 1px solid #eee; font-size: 10px; color: #666;
                height: 25px; align-items: center; font-size: 10px; color: #666;
            }

            /* Legend Styles */
            #legend {
                display: flex; justify-content: center; gap: 20px;
                padding: 15px 0; font-size: 12px; color: #444;
            }
            .legend-item { display: flex; align-items: center; gap: 8px; }
            .legend-box { width: 16px; height: 16px; border-radius: 2px; }
            
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
            const { showVerticalLabels, showHorizontalLabels, showGridlines, showLegend, barWidth, colorLY, colorCY } = this._props;
            const yAxis = this._shadowRoot.getElementById("y-axis");
            const xAxis = this._shadowRoot.getElementById("x-axis");
            const gridLayer = this._shadowRoot.getElementById("grid-layer");
            const barsLayer = this._shadowRoot.getElementById("bars-layer");
            const axisArea = this._shadowRoot.getElementById("axis-labels");
            const legendArea = this._shadowRoot.getElementById("legend");
            const tooltip = this._shadowRoot.getElementById("tooltip");
            
            axisArea.innerHTML = "";
            legendArea.innerHTML = "";
            yAxis.innerHTML = xAxis.innerHTML = gridLayer.innerHTML = barsLayer.innerHTML = legend.innerHTML = "";
            yAxis.style.display = showVerticalLabels ? "block" : "none";
            xAxis.style.display = showHorizontalLabels ? "flex" : "none";
            xAxis.style.paddingLeft = showVerticalLabels ? "55px" : "15px";


            axisArea.style.display = this._props.showAxis ? "flex" : "none";

            if (this._data.length === 0) return;

            // Render Legend
            if (this._props.showLegend) {
                legendArea.innerHTML = `
                    <div class="legend-item"><div class="legend-box" style="background:${this._props.colorLY}"></div>LY</div>
                    <div class="legend-item"><div class="legend-box" style="background:${this._props.colorCY}"></div>CY</div>
                `;
            }

            // 1. Calculate Bounds (Always include 0)
            const values = this._data.map(d => parseFloat(d.value));
            let max = Math.max(0, ...values);
            let min = Math.min(0, ...values);
            const range = max - min;
            const zeroPos = (max / range) * 100; // % from top

            // 2. Generate Neat Ticks (Min, 0, Max + Middle)
            const ticks = Array.from(new Set([max, min, 0, max / 2, min / 2])).sort((a, b) => b - a);
            
            ticks.forEach(t => {
                const pos = ((max - t) / range) * 100;
                if (showVerticalLabels) {
                    const tickEl = document.createElement("div");
                    tickEl.className = "y-tick";
                    tickEl.style.top = `${pos}%`;
                    tickEl.innerText = Math.round(t);
                    yAxis.appendChild(tickEl);
                }
                if (showGridlines) {
                    const line = document.createElement("div");
                    line.className = `grid-line ${t === 0 ? 'zero-line' : ''}`;
                    line.style.top = `${pos}%`;
                    gridLayer.appendChild(line);
                }
            });

            // 3. Render Bars
            this._data.forEach(d => {
                const val = parseFloat(d.value);
                const barHeight = (Math.abs(val) / range) * 100;
                
                const wrapper = document.createElement("div");
                wrapper.className = "bar-wrapper";
                wrapper.style.width = `${barWidth}px`;

                
            // 4. Create Bar
                const bar = document.createElement("div");
                bar.className = "bar";
                bar.style.width = "100%";
                bar.style.height = `${barHeight}%`;
                bar.style.backgroundColor = d.indicator === "LY" ? this._props.colorLY : this._props.colorCY;

    
            // Position logic: if positive, bottom of bar is zero line. If negative, top is zero line.
                if (val >= 0) {
                    bar.style.top = `${zeroPos - barHeight}%`;
                } else {
                    bar.style.top = `${zeroPos}%`;
                }
                
                // Tooltip Interaction
                bar.addEventListener("mouseenter", (e) => this.showTooltip(e, d));
                bar.addEventListener("mousemove", (e) => this.moveTooltip(e));
                bar.addEventListener("mouseleave", () => tooltip.style.display = "none");

                wrapper.appendChild(bar);
                barsLayer.appendChild(wrapper);

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
                <div class="tt-value">${data.currency || ''}${this.formatValue(data.value)}</div>
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
            <div class="row">
                <input type="checkbox" id="prop_verticalLabels">
                <label for prop_VerticalLabels>Vertical Labels</label></div>
            <div class="row">
                <input type="checkbox" id="prop_horizontalLabels">
                <label for="prop_horizontalLabels">Horizontal Labels</label></div>
            <div class="row">
                <input type="checkbox" id="prop_showGridlines">
                <label for="prop_showGridlines">Show Gridlines</label></div>
            <div class="row">
                <input type="checkbox" id="prop_showLegend">
                <label for="prop_showLegend">Show Legend</label></div>
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
            this._shadowRoot.getElementById("prop_verticalLabels").checked = s.verticalLabels;
            this._shadowRoot.getElementById("prop_horizontalLabels").checked = s.horizontalLabels;
            this._shadowRoot.getElementById("prop_showGridlines").checked = s.showGridlines;
            this._shadowRoot.getElementById("prop_showLegend").checked = s.showLegend;
            this._shadowRoot.getElementById("prop_measureName").value = s.measureName;
            this._shadowRoot.getElementById("prop_colorLY").value = s.colorLY;
            this._shadowRoot.getElementById("prop_colorCY").value = s.colorCY;
            this._shadowRoot.getElementById("prop_barWidth").value = s.barWidth;
        }
    }

    customElements.define("custom-bar-chart-builder", CustomBarChartBuilder);
})();
