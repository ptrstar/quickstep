class GS {
    constructor(gs) {
        this.gs = gs;
    }
    invert() {
        return new GS(1-this.gs);
    }
    subtract(other) {
        return new GS(Math.max(0, this.gs - other.gs))
    }
    add(other) {
        return new GS(Math.min(1, this.gs + other.gs))
    }
}