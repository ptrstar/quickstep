class CreateGS extends StageNode {
    constructor() {
        super();

        this.inputType = "void";
        this.outputType = "GS[][]";

        this.baseValue = 0.5;
        this.amtRand = 0.5;
    }

    compute() {

        this.output = [];

        for (let y = 0; y < Unit.bufferSize.y; y++) {
            const row = [];
            for (let x = 0; x < Unit.bufferSize.x; x++) {
                var val = this.baseValue + (Math.random() * this.amtRand - this.amtRand / 2);
                row.push(new GS(Math.min(1, Math.max(0, val))));
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
            max="1" 
            step="0.05"
            value="${this.baseValue}"
            oninput="Net.handleEvent('${this.id}', 'baseValue', event)">BaseValue</input>

            <input 
            type="range" 
            min="0.0" 
            max="1" 
            step="0.05"
            value="${this.amtRand}"
            oninput="Net.handleEvent('${this.id}', 'amtRand', event)">AmtRand</input>
            
            <button onclick="Net.handleEvent('${this.id}', 'run', event)">RUN</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "amtRand":
                this.amtRand = parseFloat(event.target.value);
                break;
            case "baseValue":
                this.baseValue = parseFloat(event.target.value);
                break;
            case "run":
                this.run();
                break;
        }
        this.run();
    }
}
