class ShiftGS extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "GS[][]";

        this.xshift = 0.0;
        this.yshift = 0.0;
        this.zoom = 1.0;
    }

    compute() {

        this.output = [];

        for (let y = 0; y < Unit.bufferSize.y; y++) {
            const row = [];
            for (let x = 0; x < Unit.bufferSize.x; x++) {
                var yy = parseInt((y + this.yshift * Unit.bufferSize.y) * 1/this.zoom);
                var xx = parseInt((x + this.xshift * Unit.bufferSize.x) * 1/this.zoom);
                if (yy >= 0 && yy < Unit.bufferSize.y && xx >= 0 && xx < Unit.bufferSize.x) {
                    row.push(new GS(this.input[yy][xx].gs));
                } else {
                    row.push(new GS(1));
                }
            }
            this.output.push(row);
        }

        this.preview();
        this.setBusy(false);
    }
    preview() {

        const width = Unit.mm2pix(Unit.mmThumbnailWidth);
        this.canvas.width = Unit.bufferSize.x;
        this.canvas.height = Unit.bufferSize.y;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${width / Unit.aspectRatio}px`;

        const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
        for (let y = 0; y < this.output.length; y++) {
            for (let x = 0; x < this.output[0].length; x++) {
                const gs = this.output[y][x];
                const index = (y * this.canvas.width + x) * 4;
                imageData.data[index] = gs.gs * 255;
                imageData.data[index + 1] = gs.gs * 255;
                imageData.data[index + 2] = gs.gs * 255;
                imageData.data[index + 3] = 255;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
        
    }

    getControlTemplate() {
        return `
            <input 
                type="range" 
                min="-1.0" 
                max="1.0" 
                step="0.05"
                value="${this.xshift}"
                oninput="Net.handleEvent('${this.id}', 'xshift', event)">xShift</input>
            <input 
                type="range" 
                min="-1.0" 
                max="1.0" 
                step="0.05"
                value="${this.yshift}"
                oninput="Net.handleEvent('${this.id}', 'yshift', event)">yShift</input>
            <input 
                type="range" 
                min="0.1" 
                max="5.0" 
                step="0.1"
                value="${this.zoom}"
                oninput="Net.handleEvent('${this.id}', 'zoom', event)">Zoom</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "xshift":
                this.xshift = parseFloat(event.target.value);
                break;
            case "yshift":
                this.yshift = parseFloat(event.target.value);
                break;
            case "zoom":
                this.zoom = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
