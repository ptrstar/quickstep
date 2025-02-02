class PostcardBack extends StageNode {
    constructor() {
        super();

        this.inputType = "void";
        this.outputType = "Line[]";

    }

    compute() {

        this.output = [];

        // central divider
        var line = new Line();
        line.push(new Point(20, Unit.mmSize.y / 2));
        line.push(new Point(Unit.mmSize.x - 20, Unit.mmSize.y / 2));
        this.output.push(line);

        
        //compute

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
                type="text"
                value="";
                oninput="Net.handleEvent('${this.id}', 'text', event)"></input>

            <button onclick="Net.handleEvent('${this.id}', 'run', event)">RUN</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "text":
                this.text = event.target.value;
                break;
        }
        this.run();
    }
}
