class Hatching extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "Line[]";

        this.lineSpacing = 10;
        this.maxDensity = 2;
        this.lineOffset = 2;
        this.noiseLevel = 0.5;
    }


    compute() {

        this.output = [];

        var image  = this.simplify();

        const applyHatching = this.hatchLines(image);

        this.output = this.complexify(applyHatching);

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

    complexify(simple) {
        var lines = [];
        simple.forEach(l => {
            var line = new Line(0.7);
            line.push(new Point(l.start[0], l.start[1]));
            line.push(new Point(l.end[0], l.end[1]));
            lines.push(line);
        })
        return lines;
    }

    sobelGradient = (input) => {
        const sobelX = [
            [-1, 0, 1],
            [-2, 0, 2],
            [-1, 0, 1]
        ];
        const sobelY = [
            [-1, -2, -1],
            [0, 0, 0],
            [1, 2, 1]
        ];
        const gradX = this.convolve2D(input, sobelX);
        const gradY = this.convolve2D(input, sobelY);
        const magnitude = gradX.map((row, y) => row.map((gx, x) => Math.hypot(gx, gradY[y][x])));
        const direction = gradX.map((row, y) => row.map((gx, x) => Math.atan2(gradY[y][x], gx)));
        return { magnitude, direction };
    };
    convolve2D = (input, kernel) => {
        const output = input.map(row => row.slice());
        const offset = Math.floor(kernel.length / 2);
        for (let y = offset; y < input.length - offset; y++) {
            for (let x = offset; x < input[0].length - offset; x++) {
                let sum = 0;
                for (let ky = -offset; ky <= offset; ky++) {
                    for (let kx = -offset; kx <= offset; kx++) {
                        sum += input[y + ky][x + kx] * kernel[ky + offset][kx + offset];
                    }
                }
                output[y][x] = sum;
            }
        }
        return output;
    };

    hatchLines = (input) => {
    // hatchLines = (input, lineSpacing = 10, maxDensity = 5, lineOffset = 2, noiseLevel = 0.5) => {
        /*
        Parameters:
        - input: 2D array of greyscale values (0 to 1)
        - lineSpacing: Distance between hatching lines (larger = less dense hatching)
        - maxDensity: Maximum number of hatch lines per grid cell (controls darkness)
        - lineOffset: Distance between individual lines in a hatch group
        - noiseLevel: Adds randomness to the hatching lines (0 = no noise, 1 = max noise)
        */
    
        const hatchArray = input.map(row => row.map(value => Math.floor((1 - value) * this.maxDensity)));
        const gradients = this.sobelGradient(input); // Get gradient directions
        const lines = [];
        for (let y = 0; y < input.length; y += this.lineSpacing) {
            for (let x = 0; x < input[0].length; x += this.lineSpacing) {
                const density = hatchArray[y][x];
                const gradientDir = gradients.direction[y][x];
                for (let i = 0; i < density; i++) {
                    const noise = (Math.random() - 0.5) * this.noiseLevel * this.lineSpacing;
                    const angle = gradientDir + Math.PI / 2; // Perpendicular to gradient
                    const dx = Math.cos(angle) * this.lineSpacing;
                    const dy = Math.sin(angle) * this.lineSpacing;
                    lines.push({
                        start: [x + noise, y + i * this.lineOffset + noise],
                        end: [x + dx + noise, y + dy + i * this.lineOffset + noise]
                    });
                }
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
