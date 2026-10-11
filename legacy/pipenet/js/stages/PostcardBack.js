class PostcardBack extends StageNode {
    constructor() {
        super();

        this.inputType = "void";
        this.outputType = "Line[]";

        this.address = "";
        this.message = "";
    }

    compute() {

        this.output = [];

        // central divider
        var line = new Line();
        line.push(new Point(20, Unit.mmSize.y / 2));
        line.push(new Point(Unit.mmSize.x - 20, Unit.mmSize.y / 2));
        this.output.push(line);

        // address
        var buffer = Fontparser.parse(this.address, "/quickstep/assets/RobotoMono-Regular.ttf", 8, 1);
        buffer.forEach(line => {
            this.output.push(line.transform(3 * Math.PI / 2, new Point())._offset(new Point(20, Unit.mmSize.y/2 - 10)));
        });

        // message
        buffer = Fontparser.parse(this.message, "/quickstep/assets/Vegan.ttf", 8, 1);
        buffer.forEach(line => {
            this.output.push(line.transform(3 * Math.PI / 2, new Point())._offset(new Point(20, Unit.mmSize.y - 10)));
        });

        // postmark
        this.output = [...this.output, ...Shape.rect(new Point(10, 10), new Point(9, 14))];
        

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
            <textarea 
                rows="4"
                cols="30"
                value=""
                oninput="Net.handleEvent('${this.id}', 'address', event)"></textarea>
            <textarea 
                rows="7"
                cols="30"
                value=""
                oninput="Net.handleEvent('${this.id}', 'message', event)"></textarea>
            

            <button onclick="Net.handleEvent('${this.id}', 'run', event)">RUN</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "address":
                this.address = event.target.value;
                break;
            case "message":
                this.message = event.target.value;
                break;
        }
        this.run();
    }
}
