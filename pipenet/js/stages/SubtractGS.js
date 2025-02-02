class SubtractGS extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "GS[][]";

        this.requiredInputs = 2;

        this.direction = 1;
    }


    compute() {

        this.output = [];

        var inputA = this.direction ? this.inputArray[0] : this.inputArray[1];
        var inputB = !this.direction ? this.inputArray[0] : this.inputArray[1];

        for (let y = 0; y < Unit.bufferSize.y; y++) {
            const row = [];
            for (let x = 0; x < Unit.bufferSize.x; x++) {
                row.push(inputA[y][x].subtract(inputB[y][x]));
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
                step="1.0"
                value="${this.direction}"
                oninput="Net.handleEvent('${this.id}', 'direction', event)">Direction</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "direction":
                this.direction = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
