class SmoothLine extends StageNode {
    constructor() {
        super();

        this.inputType = "Line[]";
        this.outputType = "Line[]";

        this.threshhold = 1;
    }


    compute() {

        this.output = [];

        this.input.forEach(line => {
            var l = new Line(0.7);
            l.push(line.first);
            for (var i = 0; i < line.buffer.length; i++) {
                var p = new Point();
                var c = 0;
                for (var j = Math.max(i-this.threshhold, 0); j < Math.min(line.buffer.length, i+this.threshhold); j++) {
                    
                    p._add(line.buffer[j]);
                    c++;
                }
                l.push(p.scale(1/c));
            }
            l.push(line.buffer[line.buffer.length-1]);
            this.output.push(l);
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
                max="10" 
                step="1"
                value="${this.threshhold}"
                oninput="Net.handleEvent('${this.id}', 'threshhold', event)">Threshhold</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "threshhold":
                this.threshhold = parseInt(event.target.value);
                break;
        }
        this.run();
    }
}
