class AmplifySpiral extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "Line[]";

        this.max = 80;
        this.step = 2;
        this.b = 1;
        this.frequency = 1;
        this.amplitude = 10;
        this.freqMod = 0;
        this.penWidth = 0.7;
    }

    getControlTemplate() {
        return `
            <input 
                type="range" 
                min="0.02" 
                max="1" 
                step="0.02"
                value="${this.b}"
                oninput="Net.handleEvent('${this.id}', 'b', event)">B</input>
            <input 
                type="range" 
                min="0.1" 
                max="2" 
                step="0.1"
                value="${this.step}"
                oninput="Net.handleEvent('${this.id}', 'step', event)">Step</input>
            <input 
                type="range" 
                min="40.0" 
                max="200.0" 
                step="20"
                value="${this.max}"
                oninput="Net.handleEvent('${this.id}', 'max', event)">Max</input>
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
                min="0.1" 
                max="1.0" 
                step="0.1"
                value="${this.penWidth}"
                oninput="Net.handleEvent('${this.id}', 'penWidth', event)">PenWidth</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "b":
                this.b = parseFloat(event.target.value);
                break;
            case "step":
                this.step = parseFloat(event.target.value);
                break;
            case "max":
                this.max = parseFloat(event.target.value);
                break;
            case "frequency":
                this.frequency = parseFloat(event.target.value);
                break;
            case "amplitude":
                this.amplitude = parseFloat(event.target.value);
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

        var offsetX = Unit.bufferSize.x / 2;
        var offsetY = Unit.bufferSize.y / 2;

        var line = new Line(this.penWidth);
        var step = 0;

        for (var alpha = Math.PI; alpha < this.max; alpha += step) {

            var m = alpha / (Math.PI * 2);
            const arcLength = Math.PI * m * this.b * Math.sqrt(1 + Math.pow(2 * Math.PI * m, 2)) + this.b * Math.asinh(2*Math.PI*m) / 2;
            // console.log(arcLength);
            
            var r = alpha * this.b;
            step = this.step / r;
            
            var yy = parseInt((offsetY + r * Math.sin(alpha)));
            var xx = parseInt((offsetX + r * Math.cos(alpha)));
            
            if (yy >= 0 && yy < Unit.bufferSize.y && xx >= 0 && xx < Unit.bufferSize.x) {
                var factor = 1-this.input[yy][xx].gs;
                
                line.push(new Point(
                    (offsetX + (r + factor * Math.sin(arcLength * this.frequency) * this.amplitude) * Math.cos(alpha)) / Unit.bufferScale,
                    (offsetY + (r + factor * Math.sin(arcLength * this.frequency) * this.amplitude) * Math.sin(alpha)) / Unit.bufferScale
                ));
            } else {
                if (!line.isEmpty()) {
                    this.output.push(line);
                    line = new Line(this.penWidth);
                }
            }
        }

        if (this.output.length == 0) {
            this.output.push(line);
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
