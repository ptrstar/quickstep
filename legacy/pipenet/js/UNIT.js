class UNIT {
    constructor() {

        this.ppmm = 150/28.5;
        this.mmSize = new Point(105, 148);
        this.aspectRatio = this.mmSize.x / this.mmSize.y;
        this.bufferScale = 2;
        this.bufferSize = this.mmSize.scale(this.bufferScale);

        this.mmThumbnailWidth = 30;

        this.mm2xstep = 200/40;
        this.mm2ystep = 200/42; // note its not the same
    }

    mm2pix(val = 1) {
        return val * this.ppmm;
    }
}