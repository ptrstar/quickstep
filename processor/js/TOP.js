class TOP {
    /*
    Toplevel class doing what nobody else wants todo, setup, DOM etc.
    */
    constructor() {

        this.stageContainer = document.getElementById('StageContainer');
        this.canvas = document.getElementById('ConnectionCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.overview = document.getElementById('Overview');

        this.basic_stages = [
            "LoadImage"
        ];
        this.saved_stages = [
            
        ];

        this.stages = [];

        this.setupViewPort();
        this.attachControls()
        
    }

    createStage(type) {
        var stage;
        eval("stage = new Stage('"+type+"')");
        this.stages.push(stage);
    }
    propagateInput(stageId, type, event) {
        var stage = this.stages.find(s => s.id == stageId);
        if (stage) {
            stage.handleEvent(type, event);
        }
    }

    /*
            DOM
    */

    setupViewPort() {
        const pix = 150;
        this.overview.style.width = pix + "px";
        this.stageContainer.style.width = (window.innerWidth - pix) + "px";
        this.stageContainer.style.height = window.innerHeight + "px";
        this.canvas.width = (window.innerWidth - pix);
        this.canvas.height = window.innerHeight;
    }
    attachControls() {
        const controlbox = document.getElementById('BasicStages');
        var template = "";
        this.basic_stages.forEach(type => {
            template +=`
                <button onclick="Top.createStage('${type}')">${type}</button>
            `;
        });
        controlbox.innerHTML = template;
    }
}