class Textarea extends StageNode {
    constructor() {
        super();

        // TODO: Tell opentype to put things on new lines

        this.inputType = "void";
        this.outputType = "Line[]";

        this.fontSize = 35;
        this.spacing = 1;
        this.xOffset = 0;
        this.yOffset = 0;
        this.text = "";

        this.getFontFiles();
        this.loadFont('/assets/Vegan.ttf');
        this.ttfFiles = null;
        this.font = null;
    }

    async loadFont(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load font at ${path}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            this.font = opentype.parse(arrayBuffer);
            this.compute();
            this.preview();
        } catch (error) {
            console.error("Error loading font:", error);
        }
    }

    async getFontFiles() {
        try {
            const response = await fetch('/assets/');
            if (!response.ok) {
                throw new Error(`Failed to fetch assets directory: ${response.statusText}`);
            }
            const text = await response.text();
    
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");
            const links = Array.from(doc.querySelectorAll('a'));
            const ttfFiles = links
                .map(link => link.getAttribute('href'))
                .filter(href => href && href.endsWith('.ttf'));
    
            this.ttfFiles = ttfFiles;

            const select = document.createElement("select");
            select.onclick = (event) => event.stopPropagation();
            select.onchange = (event) => Net.handleEvent(`${this.id}`, 'font', event);
            this.ttfFiles.forEach(file => {
                const option = document.createElement("option");
                option.value = file;
                option.textContent = file.split('/').pop();
                select.appendChild(option);
            });
            this.controlbox.appendChild(select);

        } catch (error) {
            console.error("Error fetching font files:", error);
        }
    }

    compute() {

        this.output = [];
        //compute
        
        let paths = this.font.getPaths(this.text, this.xOffset, this.yOffset, this.fontSize);

        paths.forEach(path => {
            var line = new Line();
            
            path.commands.forEach(command => {
                if (command.type == "M" || command.type == "L" || command.type == "Q") {
                    line.push(new Point(command.x, command.y));
                } else if (command.type == "Z") {
                    this.output.push(line);
                    line = new Line();
                }
            })

            this.output.push(line);
        });

        // let points = this.font.textToPoints(char, this.xOffset + this.fontSize * this.spacing * i, this.yOffset, this.fontSize, { sampleFactor:  0.5 });
        // points.forEach(point => {
        //     line.push(new Point(point.x, point.y));
        // })
        // this.output.push(line);
        // i++;
        

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
                rows="5"
                cols="30"
                value=""
                oninput="Net.handleEvent('${this.id}', 'text', event)"></textarea>
            <input 
                type="range" 
                min="6" 
                max="50" 
                step="2"
                value="${this.fontSize}"
                oninput="Net.handleEvent('${this.id}', 'fontSize', event)">FontSize</input>
            <input 
                type="range" 
                min="0" 
                max="4" 
                step="0.2"
                value="${this.spacing}"
                oninput="Net.handleEvent('${this.id}', 'spacing', event)">Spacing</input>
            <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value="${this.xOffset}"
                oninput="Net.handleEvent('${this.id}', 'xOffset', event)">xOffset</input>
            <input 
                type="range" 
                min="0" 
                max="100" 
                step="5"
                value="${this.yOffset}"
                oninput="Net.handleEvent('${this.id}', 'yOffset', event)">yOffset</input>

            <button onclick="Net.handleEvent('${this.id}', 'run', event)">RUN</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "text":
                this.text = event.target.value;
                break;
            case "fontSize":
                this.fontSize = parseInt(event.target.value);
                break;
            case "spacing":
                this.spacing = parseFloat(event.target.value);
                break;
            case "xOffset":
                this.xOffset = parseInt(event.target.value);
                break;
            case "yOffset":
                this.yOffset = parseInt(event.target.value);
                break;
            case "run":
                this.run();
                break;
            case "font":
                this.loadFont(event.target.value);
                break;
        }
        this.run();
    }
}
