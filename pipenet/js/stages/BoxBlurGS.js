class BoxBlurGS extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "GS[][]";

        this.boxSize = 1;
    }

    compute() {

        this.output = [];

        for (let y = 0; y < Unit.bufferSize.y; y++) {
            const row = [];
            for (let x = 0; x < Unit.bufferSize.x; x++) {

                var val = 0;
                var c = 0;

                for (var i = -this.boxSize; i <= this.boxSize; i++) {
                    for (var j = -this.boxSize; j <= this.boxSize; j++) {
                        if (x+i >= 0 && x+i < Unit.bufferSize.x && y+j >= 0 && y+j < Unit.bufferSize.y) {
                            val += this.input[y+j][x+i].gs;
                            c++;  
                        }
                    }
                }

                row.push(new GS(val / c));
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
                max="10.0" 
                step="1.0"
                value="${this.boxSize}"
                oninput="Net.handleEvent('${this.id}', 'boxSize', event)">BoxSize</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "boxSize":
                this.boxSize = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
