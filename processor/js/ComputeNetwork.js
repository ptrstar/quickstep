class ComputeNetwork {
    constructor() {
        this.stages = [];

        this.inputs = [];
        this.outputs = [];
    }

    setComputeStage(compute_stage) {
        /*
            basic stages only have one fully connected node
        */
        this.removeStages();
        this.stages = [compute_stage];
        this.inputs = [compute_stage];
        this.outputs = [compute_stage];
    }


    removeStages() {
        this.stages.forEach(stage => {
            stage.remove();
        });
        this.stages = [];
        this.inputs = [];
        this.outputs = [];
    }

}