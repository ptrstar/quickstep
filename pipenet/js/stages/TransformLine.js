class TransformLine extends StageNode {
    constructor() {
        super();

        this.inputType = "Line[]";
        this.outputType = "Line[]";
    }

    compute() {

        this.output = [];

        this.input.forEach(line => {
            var new_line = new Line();
            line.buffer.forEach(point => {
                new_line.push(new Point(-point.y, point.x));
            });
            this.output.push(new_line);
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

        `;
    }
    handleEvent(type, event) {
        // switch(type) {
        //     case "export":
        //         this.export();
        //         break;
        //     case "sim":
        //         this.auto_run_sim = !this.auto_run_sim;
        //         break;
        // }
        this.run();
    }
}
