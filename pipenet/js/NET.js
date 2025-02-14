class NET {
    constructor() {
        this.pipelineContainer = document.getElementById('pipelineContainer');
        this.canvas = document.getElementById('pipelineConnectionCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.overview = document.getElementById('overview');

        this.stageTypes = [
            "ImageLoader",
            "RGBA2GS",
            "InvertGS",
            "InvertRGBA",
            "AmplifyLine",
            "LineDisplay",
            "CreateGS",
            "ShiftGS",
            "AmplifySpiral",
            "ContrastGS",
            "BoxBlurGS",
            "AddGS",
            "SubtractGS",
            "Text",
            "Textarea",
            "AddLine",
            "AbstSpiral",
            "PostcardBack",
            "TransformLine",
            "Hatching",
            "CannyEdge",
            "EdgeToLine"
        ];
        this.stages = [];

        this.connectionCache;

        this.attachControls();
        this.setupViewPort();
    }

    createStage(type) {
        var stage;
        eval("stage = new "+type+"()");
        this.stages.push(stage);
    }
    pop(id) {
        var index = this.stages.findIndex(s => s.id == id);
        this.stages[index].pop();
        this.stages.splice(index, 1);
    }

    handleEvent(stageId, type, event) {
        var stage = this.stages.find(s => s.id == stageId);
        if (stage) {
            stage.handleEvent(type, event);
        }
    }



    //
    //      DOM
    //

    renderConnections() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.stages.forEach(stage => {
            stage.outputStages.forEach(target => {
                var start = stage.getStartConnection();
                var end = target.getEndConnection();
                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.bezierCurveTo(start.x + 150, start.y, end.x-150, end.y, end.x, end.y);
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.arc(start.x, start.y, 10, 0, Math.PI * 2);
                this.ctx.fillStyle = "black";
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.arc(end.x, end.y, 10, 0, Math.PI * 2);
                this.ctx.strokeStyle = "black";
                this.ctx.stroke();
            });
        });
    }
    
    cacheConnection(id) {
        if (this.connectionCache) {
            var stageA = this.stages.find(stage => stage.id == this.connectionCache);
            var stageB = this.stages.find(stage => stage.id == id);

            if (stageA.outputType == stageB.inputType && id != this.connectionCache) {
                if (undefined == stageA.outputStages.find(s => s.id == id)) {
                    stageA.addOutputStage(stageB);
                    stageB.addInputStage(stageA);
                } else {
                    stageA.removeOutputStage(stageB);
                    stageB.removeInputStage(stageA);

                }
            } else {
                stageA.run(); // experimental
                stageA.setStatus("TYPE ERROR");
            }

            this.renderConnections();
            this.connectionCache = undefined;
        } else {
            this.connectionCache = id;
            
        }
    }

    attachControls() {
        const controlbox = document.getElementById('controls');
        var template = "";
        this.stageTypes.forEach(type => {
            template +=`
                <button onclick="Net.createStage('${type}')">${type}</button>
            `;
        });
        controlbox.innerHTML = template;
    }
    setupViewPort() {
        const pix = 150;
        this.overview.style.width = pix + "px";
        this.pipelineContainer.style.width = (window.innerWidth - pix) + "px";
        this.pipelineContainer.style.height = window.innerHeight + "px";
        this.canvas.width = (window.innerWidth - pix);
        this.canvas.height = window.innerHeight;
    }
}