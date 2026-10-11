class InvertRGBA extends StageNode {
    constructor() {
        super();

        this.inputType = "RGBA[][]";
        this.outputType = "RGBA[][]";

        this.fileURL;
    }

    compute() {

        this.output = [];

        for (let y = 0; y < this.input.length; y++) {
            const row = [];
            for (let x = 0; x < this.input[0].length; x++) {
                row.push(this.input[y][x].invert());
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
                const rgba = this.output[y][x];
                const index = (y * this.canvas.width + x) * 4;
                imageData.data[index] = rgba.r * 255;
                imageData.data[index + 1] = rgba.g * 255;
                imageData.data[index + 2] = rgba.b * 255;
                imageData.data[index + 3] = 255;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
        
    }
}
