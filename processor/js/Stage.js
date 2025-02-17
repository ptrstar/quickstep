class Stage {
    /*
    Is the litteral stage (multistage) object and handles UI
    */
    constructor(type, isBasic = true) {

        this.network = new ComputeNetwork();

        if (isBasic) {
            var comp = eval("new "+type+"();");
            this.network.setComputeStage(comp);
        } else {
            throw new Error("non basics not yet implemented");
        }

        this.setupDOM();
    }


    /*
            GRAPHIC
    */

    setupDOM() {
        this.container = document.createElement('div');
        this.container.setAttribute('class','stageNode');

        const header = document.createElement('div');
        header.setAttribute('class', 'stageHeader')
        header.innerHTML = `<p>${this.constructor.name}</p><button onclick="Top.pop('${this.id}')">pop</button>`;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.controlbox = document.createElement('div');
        this.controlbox.setAttribute('class', 'controlbox');
        this.controlbox.addEventListener('mousemove', (event) => {
            event.stopPropagation();
        });
        this.controlbox.innerHTML = this.compute.getControls();
        this.status = document.createElement('p');

        this.container.appendChild(header);
        this.container.appendChild(this.controlbox);
        this.container.appendChild(this.canvas);
        this.container.appendChild(this.status);

        this.setupEvents();
        Top.stageContainer.appendChild(this.container);
    }
    getControlTemplate() {
        return "";
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