class Text extends StageNode {
    constructor() {
        super();

        this.inputType = "void";
        this.outputType = "Line[]";

        this.fontSize = 12;
        this.xOffset = 0;
        this.yOffset = 50;
        this.text = "";

        this.font = null;
        this.setFonts();
    }

    async setFonts() {

        const fontPaths = Fontparser.getFonts();
        this.font = fontPaths[0];

        const select = document.createElement("select");
        select.onclick = (event) => event.stopPropagation();
        select.onchange = (event) => Net.handleEvent(`${this.id}`, 'font', event);
        fontPaths.forEach(file => {
            const option = document.createElement("option");
            option.value = file;
            option.textContent = file.split('/').pop();
            select.appendChild(option);
        });
        this.controlbox.appendChild(select);
    }

    compute() {

        this.output = Fontparser.parse(this.text, this.font, this.fontSize);

        this.output.forEach(line => {
            line._offset(new Point(this.xOffset, this.yOffset));
        });

        this.preview();
        this.setBusy(false);
    }
    preview() {

        this.canvas.width = Unit.bufferSize.x;
        this.canvas.height = Unit.bufferSize.y;

        this.ctx.fillStyle = "white";
        this.ctx.fillRect(0,0, this.canvas.width, this.canvas.height);
        
        const width = Unit.mm2pix(Unit.mmThumbnailWidth);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${width / Unit.aspectRatio}px`;

        this.output.forEach(line => {
            this.ctx.lineWidth =  Unit.bufferScale * line.penWidth;
            this.ctx.beginPath();
            line.buffer.forEach(point => {
                this.ctx.lineTo(point.x * Unit.bufferScale, point.y * Unit.bufferScale);
            });
            this.ctx.stroke();
        }); 
    }

    getControlTemplate() {
        return `
            <input 
                type="text"
                value="";
                oninput="Net.handleEvent('${this.id}', 'text', event)"></input>
            <input 
                type="range" 
                min="2" 
                max="40" 
                step="1"
                value="${this.fontSize}"
                oninput="Net.handleEvent('${this.id}', 'fontSize', event)">FontSize</input>
            <input 
                type="range" 
                min="0" 
                max="${Unit.mmSize.x}" 
                step="${Unit.mmSize.x/100}"
                value="${this.xOffset}"
                oninput="Net.handleEvent('${this.id}', 'xOffset', event)">xOffset</input>
            <input 
                type="range" 
                min="0" 
                max="${Unit.mmSize.y}" 
                step="${Unit.mmSize.x/100}"
                value="${this.yOffset}"
                oninput="Net.handleEvent('${this.id}', 'yOffset', event)">yOffset</input>

            <button onclick="Net.handleEvent('${this.id}', 'run', event)">RUN</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "text":
                this.text = event.target.value;
                break;
            case "fontSize":
                this.fontSize = parseInt(event.target.value);
                break;
            case "xOffset":
                this.xOffset = parseInt(event.target.value);
                break;
            case "yOffset":
                this.yOffset = parseInt(event.target.value);
                break;
            case "run":
                this.run();
                break;
            case "font":
                this.font = event.target.value;
                break;
        }
        this.run();
    }
}
