// Compression et redimensionnement d'image côté navigateur avant upload.
// Objectif : réduire le poids réseau (mobile + rapidité catalogue) sans
// dépendance native côté serveur (les Workers ne supportent pas sharp).
// Sortie par défaut : WebP 1600 px max, qualité 0.85. Fallback JPEG si le
// navigateur ne sait pas encoder en WebP (rare aujourd'hui).

const MAX_DIMENSION = 1600;
const TARGET_QUALITY = 0.85;

export type OptimizedImage = {
  file: File;
  blob: Blob;
  base64: string;
  filename: string;
  contentType: string;
  bytes: number;
};

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier échouée."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image invalide."));
    img.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

function renameExtension(name: string, newExt: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${newExt}`;
}

export async function optimizeImage(file: File): Promise<OptimizedImage> {
  // Les SVG et GIF (animés) ne sont pas ré-encodés (perte d'animation, vecteur).
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    const base64 = await readAsDataURL(file);
    return {
      file,
      blob: file,
      base64,
      filename: file.name,
      contentType: file.type,
      bytes: file.size,
    };
  }

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const { width: w0, height: h0 } = img;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible pour l'optimisation.");
  ctx.drawImage(img, 0, 0, width, height);

  // Essai WebP en priorité. Fallback JPEG si le navigateur renvoie null ou
  // un blob PNG (Safari <14).
  let contentType = "image/webp";
  let ext = "webp";
  let blob = await encode(canvas, "image/webp", TARGET_QUALITY);
  if (!blob || !blob.type.includes("webp")) {
    contentType = "image/jpeg";
    ext = "jpg";
    blob = await encode(canvas, "image/jpeg", TARGET_QUALITY);
  }
  if (!blob) throw new Error("Encodage de l'image échoué.");

  // Si le résultat est plus lourd que l'original (rare, mais possible sur
  // JPEG déjà très compressé), on conserve l'original.
  if (blob.size >= file.size && file.type.startsWith("image/")) {
    const base64 = await readAsDataURL(file);
    return {
      file,
      blob: file,
      base64,
      filename: file.name,
      contentType: file.type,
      bytes: file.size,
    };
  }

  const filename = renameExtension(file.name, ext);
  const outFile = new File([blob], filename, { type: contentType });
  const base64 = await readAsDataURL(blob);
  return {
    file: outFile,
    blob,
    base64,
    filename,
    contentType,
    bytes: blob.size,
  };
}