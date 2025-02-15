class BoxMaskLine extends StageNode {
    constructor() {
        super();

        this.inputType = "Line[]";
        this.outputType = "Line[]";

        this.start_coord = new Point();
        this.end_coord = new Point(Unit.bufferSize.x, Unit.bufferSize.y);
    }


    compute() {

        this.output = [];

        this.input.forEach(line => {
            var new_line = new Line(line.lineWidth);
            line.buffer.forEach(point => {
                if (
                    point.x >= this.start_coord.x &&
                    point.x < this.end_coord.x &&
                    point.y >= this.start_coord.y &&
                    point.y < this.end_coord.y
                ) {
                    new_line.push(point.clone());
                }
            });
            if (!new_line.isEmpty()) {
                this.output.push(new_line);
            }
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
                type="range" 
                min="0" 
                max="${Unit.bufferSize.x}" 
                step="1"
                value="0"
                oninput="Net.handleEvent('${this.id}', 'sx', event)">StartX</input>
            <input 
                type="range" 
                min="0" 
                max="${Unit.bufferSize.y}" 
                step="1"
                value="0"
                oninput="Net.handleEvent('${this.id}', 'sy', event)">StartY</input>
            <input 
                type="range" 
                min="0" 
                max="${Unit.bufferSize.x}" 
                step="1"
                value="${Unit.bufferSize.x}"
                oninput="Net.handleEvent('${this.id}', 'ex', event)">EndX</input>
            <input 
                type="range" 
                min="0" 
                max="${Unit.bufferSize.y}" 
                step="1"
                value="${Unit.bufferSize.y}"
                oninput="Net.handleEvent('${this.id}', 'ey', event)">EndY</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "sx":
                this.start_coord.x = parseFloat(event.target.value);
                break;
            case "sy":
                this.start_coord.y = parseFloat(event.target.value);
                break;
            case "ex":
                this.end_coord.x = parseFloat(event.target.value);
                break;
            case "ey":
                this.end_coord.y = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
