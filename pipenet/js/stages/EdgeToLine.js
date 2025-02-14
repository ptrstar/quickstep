class EdgeToLine extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "Line[]";

    }


    compute() {

        this.output = [];

        var image  = this.simplify();;

        this.output = this.connectEdgesToLines(image);

        this.preview();
        this.setBusy(false);
    }
    simplify() {
        var out = []
        for (var i = 0; i < this.input.length; i++) {
            out.push([]);
            for (var j = 0; j < this.input[0].length; j++) {
                out[i][j] = this.input[i][j].gs;
            }
        }
        return out;
    }

    connectEdgesToLines = (edges) => {
        /*
        Connects detected edges into continuous lines.
        Parameters:
        - edges: 2D array of greyscale values (0 for no edge, 0.5 for weak edge, 1 for strong edge)
        Returns:
        - lines: Array of line segments, each with a start and end point
        */
        const visited = edges.map(row => row.map(() => false));
        const lines = [];
    
        const directions = [
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];
    
        const isEdge = (y, x) => y >= 0 && y < edges.length && x >= 0 && x < edges[0].length && edges[y][x] > 0 && !visited[y][x];
    
        const traceLine = (y, x) => {
            const line = new Line(0.7);
            let current = [y, x];
            while (current) {
                const [cy, cx] = current;
                visited[cy][cx] = true;
                line.push(new Point(cx, cy).scale(1/Unit.bufferScale));
                let next = null;
                directions.forEach(([dy, dx]) => {
                    const ny = cy + dy;
                    const nx = cx + dx;
                    if (isEdge(ny, nx)) next = [ny, nx];
                });
                current = next;
            }
            return line;
        };
    
        for (let y = 0; y < edges.length; y++) {
            for (let x = 0; x < edges[0].length; x++) {
                if (isEdge(y, x)) lines.push(traceLine(y, x));
            }
        }
        return lines;
    };


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
    // preview() {

    //     const width = Unit.mm2pix(Unit.mmThumbnailWidth);
    //     this.canvas.width = Unit.bufferSize.x;
    //     this.canvas.height = Unit.bufferSize.y;
    //     this.canvas.style.width = `${width}px`;
    //     this.canvas.style.height = `${width / Unit.aspectRatio}px`;

    //     const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    //     for (let y = 0; y < this.output.length; y++) {
    //         for (let x = 0; x < this.output[0].length; x++) {
    //             const gs = this.output[y][x];
    //             const index = (y * this.canvas.width + x) * 4;
    //             imageData.data[index] = gs.gs * 255;
    //             imageData.data[index + 1] = gs.gs * 255;
    //             imageData.data[index + 2] = gs.gs * 255;
    //             imageData.data[index + 3] = 255;
    //         }
    //     }
    //     this.ctx.putImageData(imageData, 0, 0);
        
    // }
    getControlTemplate() {
        return `
            <input 
                type="range" 
                min="2" 
                max="100" 
                step="2"
                value="${this.lineSpacing}"
                oninput="Net.handleEvent('${this.id}', 'lineSpacing', event)">LineSpacing</input>
            <input 
                type="range" 
                min="0.1" 
                max="5" 
                step="0.1"
                value="${this.maxDensity}"
                oninput="Net.handleEvent('${this.id}', 'maxDensity', event)">MaxDensity</input>
            <input 
                type="range" 
                min="0.1" 
                max="5" 
                step="0.1"
                value="${this.lineOffset}"
                oninput="Net.handleEvent('${this.id}', 'lineOffset', event)">LineOffset</input>
            <input 
                type="range" 
                min="0.0" 
                max="1.0" 
                step="0.05"
                value="${this.noiseLevel}"
                oninput="Net.handleEvent('${this.id}', 'noiseLevel', event)">NoiseLevel</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "lineSpacing":
                this.lineSpacing = parseFloat(event.target.value);
                break;
            case "maxDensity":
                this.maxDensity = parseFloat(event.target.value);
                break;
            case "lineOffset":
                this.lineOffset = parseFloat(event.target.value);
                break;
            case "noiseLevel":
                this.noiseLevel = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
