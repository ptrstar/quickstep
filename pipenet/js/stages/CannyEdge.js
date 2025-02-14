class CannyEdge extends StageNode {
    constructor() {
        super();

        this.inputType = "GS[][]";
        this.outputType = "GS[][]";

        // this.direction = 1;
    }


    compute() {

        this.output = [];

        var image  = this.simplify();

        this.output = this.complexify(this.cannyEdgeDetection(image));

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
        var out = []
        for (var i = 0; i < simple.length; i++) {
            out.push([]);
            for (var j = 0; j < simple[0].length; j++) {
                out[i][j] = new GS(simple[i][j]);
            }
        }
        return out;
    }

    gaussianBlur = (input, kernelSize = 5, sigma = 1) => {
        const kernel = this.createGaussianKernel(kernelSize, sigma);
        return this.convolve2D(input, kernel);
    };
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
    cannyEdgeDetection = (input) => {
        const blurred = this.gaussianBlur(input);
        const { magnitude, direction } = this.sobelGradient(blurred);
        const edges = this.nonMaximumSuppression(magnitude, direction);
        return this.doubleThresholdAndEdgeTracking(edges);
    };

    createGaussianKernel = (size, sigma) => {
        const kernel = Array(size).fill().map(() => Array(size).fill(0));
        const mean = Math.floor(size / 2);
        let sum = 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const exponent = -((x - mean) ** 2 + (y - mean) ** 2) / (2 * sigma ** 2);
                kernel[y][x] = Math.exp(exponent) / (2 * Math.PI * sigma ** 2);
                sum += kernel[y][x];
            }
        }
        return kernel.map(row => row.map(value => value / sum));
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
    nonMaximumSuppression = (magnitude, direction) => {
        const output = magnitude.map(row => row.slice());
        for (let y = 1; y < magnitude.length - 1; y++) {
            for (let x = 1; x < magnitude[0].length - 1; x++) {
                const angle = direction[y][x] * (180 / Math.PI);
                const absAngle = (angle < 0) ? angle + 180 : angle;
                const value = magnitude[y][x];
                let isMax = true;
                if ((absAngle >= 0 && absAngle < 45) || (absAngle >= 135 && absAngle <= 180)) {
                    isMax = value > magnitude[y][x - 1] && value > magnitude[y][x + 1];
                } else if (absAngle >= 45 && absAngle < 135) {
                    isMax = value > magnitude[y - 1][x] && value > magnitude[y + 1][x];
                }
                output[y][x] = isMax ? value : 0;
            }
        }
        return output;
    };
    doubleThresholdAndEdgeTracking = (edges, low = 0.1, high = 0.3) => {
        const strong = 1, weak = 0.5;
        const output = edges.map(row => row.slice());
        for (let y = 0; y < edges.length; y++) {
            for (let x = 0; x < edges[0].length; x++) {
                const value = edges[y][x];
                output[y][x] = value >= high ? strong : (value >= low ? weak : 0);
            }
        }
        return output;
    };

    preview() {

        const width = Unit.mm2pix(Unit.mmThumbnailWidth);
        this.canvas.width = Unit.bufferSize.x;
        this.canvas.height = Unit.bufferSize.y;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${width / Unit.aspectRatio}px`;

        const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
        for (let y = 0; y < this.output.length; y++) {
            for (let x = 0; x < this.output[0].length; x++) {
                const gs = this.output[y][x];
                const index = (y * this.canvas.width + x) * 4;
                imageData.data[index] = gs.gs * 255;
                imageData.data[index + 1] = gs.gs * 255;
                imageData.data[index + 2] = gs.gs * 255;
                imageData.data[index + 3] = 255;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    getControlTemplate() {
        return `
            <input 
                type="range" 
                min="0.0" 
                max="1.0" 
                step="1.0"
                value="${this.direction}"
                oninput="Net.handleEvent('${this.id}', 'direction', event)">Direction</input>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "direction":
                this.direction = parseFloat(event.target.value);
                break;
        }
        this.run();
    }
}
