class FONTPARSER {
    constructor() {

        this.filePaths = null;
        this.fonts = new Map();
    }

    getFonts() {
        return this.filePaths;
    }

    // parses text string and returns an array of lines
    parse(text, fontPath = "/quickstep/assets/Vegan.ttf", size = 12, verticalSpacingFactor = 1) {

        const font = this.fonts.get(fontPath);

        if (!font) throw new Error(fontPath + " was not loaded previously");

        let lines = text.split('\n');
        let result = [];
        lines.forEach((line, index) => {
            let p = font.getPaths(line, 0, index * verticalSpacingFactor * size, size);
            p.forEach((path) => {
                var line = new Line();
                path.commands.forEach(command => {
                    if (command.type == "M" || command.type == "L" || command.type == "Q") {
                        line.push(new Point(command.x, command.y));
                    } else if (command.type == "Z") {
                        result.push(line);
                        line = new Line();
                    }
                });
                result.push(line);
            });
        });

        return result;

    }

    async initialise() {
        await this.getFontFileDirs();
        await this.loadFonts();
    }


    // parse all fonts with opentype and be ready for parsing
    async loadFonts() {
        if (this.filePaths == []) throw new Error("filePahts should not be empty");

        this.filePaths.forEach(async (path) => {
            try {
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`Failed to load font at ${path}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                this.fonts.set(path, opentype.parse(arrayBuffer));

            } catch (error) {
                console.error("Error loading font:", error);
            }
        });
    }

    // Load all available font paths from the assets directory
    async getFontFileDirs() {
        try {
            const response = await fetch('/quickstep/assets/');
            if (!response.ok) {
                throw new Error(`Failed to fetch assets directory: ${response.statusText}`);
            }
            const text = await response.text();
    
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, "text/html");
            const links = Array.from(doc.querySelectorAll('a'));
            this.filePaths = links
                .map(link => link.getAttribute('href'))
                .filter(href => href && href.endsWith('.ttf'));
        } catch (error) {
            console.error("Error fetching font files:", error);
        }
    }
}
