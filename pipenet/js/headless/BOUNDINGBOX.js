function getBoundingBox(lines) {
    var min = new Point(Infinity, Infinity);
    var max = new Point(-Infinity, -Infinity);

    lines.forEach(line => {
        line.buffer.forEach(point => {
            if (point.x < min.x) min.x = point.x;
            if (point.y < min.y) min.y = point.y;
            if (point.x > max.x) max.x = point.x;
            if (point.y > max.y) max.y = point.y;
        });
    });

    return [min, max];
}