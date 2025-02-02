class AmplifyLine extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "Line[]";

        this.lineCount = 20;
        this.samples = 100;
        this.frequency = 1;
        this.amplitude = 10;
        this.shift = 0.1;
        this.penWidth = 0.7;
    }

    getControlTemplate() {
        return `
            <input 
                type="range" 
                min="10.0" 
                max="100.0" 
                step="5"
                value="${this.lineCount}"
                oninput="Net.handleEvent('${this.id}', 'lineCount', event)">LineCount</input>
            <input 
                type="range" 
                min="60.0" 
                max="600.0" 
                step="20"
                value="${this.samples}"
                oninput="Net.handleEvent('${this.id}', 'samples', event)">Samples</input>
            <input 
                type="range" 
                min="0.1" 
                max="3" 
                step="0.1"
                value="${this.frequency}"
                oninput="Net.handleEvent('${this.id}', 'frequency', event)">Frequency</input>
            <input 
                type="range" 
                min="0.25" 
                max="5.0" 
                step="0.25"
                value="${this.amplitude}"
                oninput="Net.handleEvent('${this.id}', 'amplitude', event)">Amplitude</input>
            <input 
                type="range" 
                min="0.0" 
                max="0.5" 
                step="0.1"
                value="${this.shift}"
                oninput="Net.handleEvent('${this.id}', 'shift', event)">Shift</input>
            <input 
                type="range" 
                min="0.1" 
                max="1.0" 
                step="0.1"
                value="${this.penWidth}"
                oninput="Net.handleEvent('${this.id}', 'penWidth', event)">PenWidth</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "lineCount":
                this.lineCount = parseFloat(event.target.value);
                break;
            case "samples":
                this.samples = parseFloat(event.target.value);
                break;
            case "frequency":
                this.frequency = parseFloat(event.target.value);
                break;
            case "amplitude":
                this.amplitude = parseFloat(event.target.value);
                break;
            case "shift":
                this.shift = parseFloat(event.target.value);
                break;
            case "penWidth":
                this.penWidth = parseFloat(event.target.value);
                break;
            default:
                return;
        }
        this.run();
    }

    compute() {

        this.output = [];

        var yInc = Unit.bufferSize.y / this.lineCount;
        var xInc = Unit.bufferSize.x / this.samples; 

        var flip = 0;

        for (var y = 0; y < this.input.length; y += yInc) {
            if (this.input[parseInt(y)][0].gs == 1) continue;
            var line = new Line(this.penWidth);
            for (var x = 0; x < this.input[0].length; x += xInc) {
                if (this.input[parseInt(y)][parseInt(x)].gs == 1) {
                    x = this.input[0].length;
                    continue;
                };
                var px = x / Unit.bufferScale;
                var py = y / Unit.bufferScale + this.amplitude * (1-this.input[parseInt(y)][parseInt(x)].gs) * Math.sin(x * this.frequency + y*this.shift);
                line.push(new Point(px, py));
            }

            if (flip == 1) {line.reverse();}
            this.output.push(line);
            flip = !flip;

        }
                
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

        // 150px fit into 285mm;
        
        // this.ctx.strokeRect(50,50,285/100 * 10,150)

        this.output.forEach(line => {
            this.ctx.lineWidth =  Unit.bufferScale * line.penWidth;
            this.ctx.beginPath();
            line.buffer.forEach(point => {
                this.ctx.lineTo(point.x * Unit.bufferScale, point.y * Unit.bufferScale);
            });
            this.ctx.stroke();
        }); 
    }
}
