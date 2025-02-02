class ContrastGS extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "GS[][]";

        this.min = 0.2;
        this.max = 0.8;
    }

    map(gs) {
        var val = gs.gs;
        var m = 1/(this.max-this.min);
        var yIntercept = -(this.min * m);
        return new GS(Math.max(0, Math.min(1, yIntercept + val * m)));

        // 0 = yInt + m * this.min
    }

    compute() {

        this.output = [];

        for (let y = 0; y < Unit.bufferSize.y; y++) {
            const row = [];
            for (let x = 0; x < Unit.bufferSize.x; x++) {

                row.push(this.map(this.input[y][x]));

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
                min="0.0" 
                max="1.0" 
                step="0.05"
                value="${this.min}"
                oninput="Net.handleEvent('${this.id}', 'min', event)">Min</input>
            <input 
                type="range" 
                min="0.0" 
                max="1.0" 
                step="0.05"
                value="${this.max}"
                oninput="Net.handleEvent('${this.id}', 'max', event)">Max</input>
            
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "min":
                this.min = parseFloat(event.target.value);
                break;
            case "max":
                this.max = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
