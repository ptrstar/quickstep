class ImageLoader extends StageNode {
    constructor() {
        super();

        this.inputType = "void";
        this.outputType = "RGBA[][]";

        this.fileURL;
    }

    getControlTemplate() {
        return `
            <input type="file" accept="image/*" onchange="Net.handleEvent('${this.id}', 'image', event)">
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "image":
                this.fileURL = URL.createObjectURL(event.target.files[0]);
                break;
        }
        this.run();
    }
    compute() {

        if (!this.fileURL) {
            this.setStatus("NO FILE");
            return;
        }

        this.output = [];
        
        const img = new Image();
        img.onload = () => {

            const canvas = document.createElement("canvas");
            canvas.width = Unit.bufferSize.x;
            const ctx = canvas.getContext("2d");

            const aspectRatio = img.width / img.height;
            canvas.height = canvas.width / aspectRatio;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            for (let y = 0; y < Unit.bufferSize.y; y++) {
                const row = [];
                for (let x = 0; x < Unit.bufferSize.x; x++) {
                    const index = (y * canvas.width + x) * 4;
                    if (index + 3 >= imageData.data.length) {

                        row.push(new RGBA(1,1,1,1));
                        
                    } else {
                        const r = imageData.data[index] / 255;
                        const g = imageData.data[index + 1] / 255;
                        const b = imageData.data[index + 2] / 255;
                        const a = imageData.data[index + 3] / 255;
                        row.push(new RGBA(r, g, b, a));
                    }
                }
                this.output.push(row);
            }

            this.preview();
            this.setBusy(false);
        }

        img.src = this.fileURL;
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

