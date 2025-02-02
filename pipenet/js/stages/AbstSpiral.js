class AbstSpiral extends StageNode {
    constructor() {
        super();

        this.inputType = "void";
        this.outputType = "Line[]";

        this.circleCount = 30;
        this.frequency = 0.5;
        this.lod = 60;

    }

    compute() {

        this.output = [];
    
        for (var i = 0; i < this.circleCount; i+=4) {
    
            var x = Unit.mmSize.x/2 + Math.cos(i/(30*this.frequency))*3;
            var y = Unit.mmSize.x/2 + Math.sin(i/(30*this.frequency))*3;
            
            var line = new Line();

            this.addCircle(x, y, i, line);

            this.output.push(line);
        }
        

        this.preview();
        this.setBusy(false);
    }

    addCircle(x, y, r, line) {
        r *= 0.2;
        for (var theta = 0; theta <= Math.PI * 2 + Math.PI / this.lod; theta += 2*Math.PI / this.lod) {
            line.push(new Point(x + Math.cos(theta) * r, y + Math.sin(theta) * r));
        }
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
                min="10" 
                max="300" 
                step="10"
                value="${this.circleCount}"
                oninput="Net.handleEvent('${this.id}', 'circleCount', event)">CircleCount</input>
            <input 
                type="range" 
                min="0.01" 
                max="1" 
                step="0.01"
                value="${this.frequency}"
                oninput="Net.handleEvent('${this.id}', 'frequency', event)">Frequency</input>

            <button onclick="Net.handleEvent('${this.id}', 'run', event)">RUN</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "circleCount":
                this.circleCount = parseInt(event.target.value);
                break;
            case "frequency":
                this.frequency = parseFloat(event.target.value);
                break;

        }
        this.run();
    }
}
