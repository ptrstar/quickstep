class StageNode { // superclass
    constructor() {
        this.id = Math.random().toString().slice(2, 1000);

        this.inputType = "";
        this.outputType = "";
        this.input;
        this.output;
        this.inputStages = [];
        this.outputStages = [];
        this.inputArray = [];
        this.requiredInputs = 0;
        
        this.busy = false
        this.setupDOM();
    }

    load(input, id) {
        if (!this.busy) {
            var index = this.inputStages.findIndex(stage => stage.id == id);
            this.inputArray[index] = input;
            this.input = input;
            return true;
        } else {
            this.setStatus("LOADSTALL");
            return false;
        }
    }
    run() {
        if (this.inputArray.length < this.requiredInputs) {
            this.setStatus("DEPENDENCYSTALL");
            return;
        }
        for (var i = 0; i < this.requiredInputs; i++) {
            if (this.inputArray[i] == undefined) {
                this.setStatus("DEPENDENCYSTALL");
                return;
            }
        }

        if (this.setBusy(true)) {
            this.compute();
        } else {
            this.setStatus("RUNSTALL");
        }
    }
    compute() {
        console.warning("Unhandled compute call");
    }

    addInputStage(stage) {
        this.inputStages.push(stage);
        this.inputArray.push(undefined);
        this.setStatus("+ INPUT");
    }
    addOutputStage(stage) {
        this.outputStages.push(stage);
        if (!this.busy && this.output) {
            this.flush();
        }
        this.setStatus("+ OUTPUT");
    }
    removeInputStage(stage) {
        var index = this.inputStages.findIndex(s => s.id == stage.id);
        if (index >= 0) {
            this.inputStages.splice(index, 1);
            this.inputArray.splice(index, 1);
            this.setStatus("- INPUT");
        }
    }
    removeOutputStage(stage) {
        var index = this.outputStages.findIndex(s => s.id == stage.id);
        if (index >= 0) {
            this.outputStages.splice(index, 1);
            this.setStatus("- OUTPUT");
        }
    }
    flush() {
        this.outputStages.forEach(stage => {
            if (stage.load(this.output, this.id)) {
                stage.run();
            }
        });
    }
    pop() {
        this.inputStages.forEach(stage => {
            stage.removeOutputStage(this);
        });
        this.outputStages.forEach(stage => {
            stage.removeInputStage(this);
        });
        Net.pipelineContainer.removeChild(this.container);
    }

    setBusy(state) {
        if (this.busy == false || (this.busy == true && state == false)) {
            this.busy = state;
            this.setStatus(this.busy ? "COMPUTING" : "IDLE");
            if (!this.busy) {this.flush()};
            return true;
        }
        return false;
    }
    setStatus(msg) {
        this.status.innerText = msg;
    }
    handleEvent(type, event) {
        console.warning("unhandled event", type, event);
    }

    //
    //      GRAPHIC
    //

    setupDOM() {
        this.container = document.createElement('div');
        this.container.setAttribute('class','stageNode');

        const header = document.createElement('div');
        header.setAttribute('class', 'stageHeader')
        header.innerHTML = `<p>${this.constructor.name}</p><button onclick="Net.pop('${this.id}')">pop</button>`;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.controlbox = document.createElement('div');
        this.controlbox.setAttribute('class', 'controlbox');
        this.controlbox.addEventListener('mousemove', (event) => {
            event.stopPropagation();
          });
          this.controlbox.innerHTML = this.getControlTemplate();
        this.status = document.createElement('p');

        this.container.appendChild(header);
        this.container.appendChild(this.controlbox);
        this.container.appendChild(this.canvas);
        this.container.appendChild(this.status);

        this.setupEvents();
        Net.pipelineContainer.appendChild(this.container);
    }
    getControlTemplate() {
        return "";
    }

    getStartConnection() {
        const computedStyle = window.getComputedStyle(this.container);
        return new Point(parseFloat(computedStyle.left) + parseFloat(computedStyle.width), parseFloat(computedStyle.top) + parseFloat(computedStyle.height) / 2);
    }
    getEndConnection() {
        const computedStyle = window.getComputedStyle(this.container);
        const height = parseFloat(computedStyle.height); // Height as a number
        return new Point(parseFloat(computedStyle.left), parseFloat(computedStyle.top) + height / 2);
    }

    setupEvents() {


        this.offset = new Point(100, 100);
        this.isDragging = false;

        this.container.addEventListener("dblclick", (e) => {
            Net.cacheConnection(this.id);
        });

        this.container.addEventListener("mousedown", (e) => {
            this.isDragging = true;            
            this.offset.x = e.clientX - this.container.offsetLeft;
            this.offset.y = e.clientY - this.container.offsetTop;
            this.container.style.cursor = "grabbing"; // Change cursor
            
        });
    
        // Dragging
        document.addEventListener("mousemove", (e) => {
            if (this.isDragging) {
                this.container.style.left = `${e.clientX - this.offset.x}px`;
                this.container.style.top = `${e.clientY - this.offset.y}px`;
                Net.renderConnections();
            }
        });
    
        // Stop dragging
        document.addEventListener("mouseup", () => {
            this.isDragging = false;
            this.container.style.cursor = "grab"; // Reset cursor
        });
    }
}