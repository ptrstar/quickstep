class TransformLine extends StageNode {
    constructor() {
        super();

        this.inputType = "Line[]";
        this.outputType = "Line[]";

        this.angle = 0;
        this.axisAlign = false;
    }

    compute() {

        this.output = [];

        var [min, max] = getBoundingBox(this.input);

        var theta = this.angle;
        if (this.axisAlign) theta = (Math.round((this.angle / (Math.PI * 2)) * 4) / 4) * Math.PI * 2;

        this.input.forEach(line => {
            this.output.push(line.transform(theta, min));
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
                max="${2*Math.PI}" 
                step="${2*Math.PI / 100}"
                value="${this.angle}"
                oninput="Net.handleEvent('${this.id}', 'angle', event)">Angle</input>

            <button onclick="Net.handleEvent('${this.id}', 'axisAlign', event)">AxisAlign</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "angle":
                this.angle = parseFloat(event.target.value);
                break;
            case "axisAlign":
                this.axisAlign = !this.axisAlign;
                break;
        }
        this.run();
    }
}
