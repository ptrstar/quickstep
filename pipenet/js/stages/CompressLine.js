class CompressLine extends StageNode {
    constructor() {
        super();

        this.inputType = "Line[]";
        this.outputType = "Line[]";

        this.threshhold = 1;
    }


    compute() {

        this.output = [];
        this.input.forEach(line => {
            this.output.push(line.clone());
        });

        this.output.forEach(line => {

            for(var i = 1; i < line.buffer.length-2; i++) {
                var area = line.buffer[i-1].area(line.buffer[i], line.buffer[i+1]);
                if (area < this.threshhold) {
                    line.remove(i);
                    i--;
                }
            }

        })

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
                max="1" 
                step="0.01"
                value="${this.threshhold}"
                oninput="Net.handleEvent('${this.id}', 'threshhold', event)">Threshhold</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "threshhold":
                this.threshhold = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
