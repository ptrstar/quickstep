class SHAPE {
    constructor() {}

    rect(position, size, penWidth = 0.7) {
        
        var line = new Line(penWidth);
        line.push(position);
        line.push(new Point(position.x, position.y + size.y));
        line.push(new Point(position.x + size.x, position.y + size.y));
        line.push(new Point(position.x + size.x, position.y));
        line.push(position);

        return [line];
    }
}