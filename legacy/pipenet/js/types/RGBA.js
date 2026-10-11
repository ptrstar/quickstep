class RGBA {
    constructor(r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    toGS() {
        return new GS((this.r + this.g + this.b) / 3);
    }
    invert() {
        return new RGBA(1-this.r, 1-this.g, 1-this.b, this.a);
    }
}