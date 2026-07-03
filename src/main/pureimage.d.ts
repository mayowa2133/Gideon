declare module "pureimage" {
  interface TextMetrics {
    width: number;
  }

  interface CanvasContext {
    fillStyle: string;
    font: string;
    clearRect(x: number, y: number, width: number, height: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    closePath(): void;
    fill(): void;
    fillText(text: string, x: number, y: number): void;
    measureText(text: string): TextMetrics;
  }

  interface Bitmap {
    getContext(kind: "2d"): CanvasContext;
  }

  interface LoadedFont {
    loadSync(): void;
  }

  const PImage: {
    make(width: number, height: number): Bitmap;
    registerFont(filePath: string, family: string): LoadedFont;
    encodePNGToStream(image: Bitmap, stream: NodeJS.WritableStream): Promise<void>;
  };

  export = PImage;
}
