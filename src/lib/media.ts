/* ------------------------------------------------------------------
   Compression des médias dans le navigateur, avant l'envoi.
   Objectif : moins d'espace de stockage, moins de bande passante,
   des chargements plus rapides pour les apprenants en 3G/4G.
   ------------------------------------------------------------------ */

type ImageOpts = { maxSize?: number; quality?: number; square?: boolean };

const supportsWebp = (() => {
  let cached: boolean | null = null;
  return () => {
    if (cached !== null) return cached;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      cached = c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      cached = false;
    }
    return cached;
  };
})();

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

/**
 * Redimensionne et ré-encode une image (WebP si possible, sinon JPEG).
 * Garde l'original s'il est déjà léger, si c'est un GIF animé, ou si la compression n'apporte rien.
 */
export async function compressImage(file: File, { maxSize = 1920, quality = 0.82, square = false }: ImageOpts = {}): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const img = await loadImage(file);
    let { naturalWidth: w, naturalHeight: h } = img;
    let sx = 0,
      sy = 0,
      sw = w,
      sh = h;
    if (square) {
      const side = Math.min(w, h);
      sx = (w - side) / 2;
      sy = (h - side) / 2;
      sw = sh = side;
      w = h = side;
    }
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    if (scale === 1 && !square && file.size < 350 * 1024) return file;

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
    URL.revokeObjectURL(img.src);

    const type = supportsWebp() ? "image/webp" : "image/jpeg";
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, type, quality));
    if (!blob || blob.size >= file.size) return file;
    const ext = type === "image/webp" ? "webp" : "jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

/* ---------------- Vidéo ----------------
   Ré-encode la vidéo en 720p (~1,8 Mbit/s) avec l'API MediaRecorder du navigateur.
   L'encodage se fait en temps réel : une vidéo de 30 s prend environ 30 s.
   En cas de problème (navigateur non compatible, vidéo illisible), on garde l'original. */

export type VideoProgress = (ratio: number) => void;

function pickRecorderType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

export async function compressVideo(file: File, onProgress?: VideoProgress, { maxSide = 1280, bitrate = 1_800_000 } = {}): Promise<File> {
  // Petites vidéos : inutile de ré-encoder
  if (file.size < 8 * 1024 * 1024) return file;
  const mime = pickRecorderType();
  if (!mime) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Vidéo illisible"));
    });
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Certaines vidéos (WebM enregistrés dans un navigateur) n'annoncent pas leur durée
      duration = await new Promise<number>((resolve) => {
        const done = () => {
          video.ondurationchange = null;
          resolve(video.duration);
        };
        video.ondurationchange = () => Number.isFinite(video.duration) && done();
        video.currentTime = 1e101;
        setTimeout(done, 4000);
      });
      video.currentTime = 0;
      await new Promise<void>((r) => {
        video.onseeked = () => r();
        setTimeout(r, 1500);
      });
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 5 * 60) return file;

    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round((video.videoWidth * scale) / 2) * 2;
    const h = Math.round((video.videoHeight * scale) / 2) * 2;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const stream = canvas.captureStream(30);
    // Son : capté sans être joué dans les haut-parleurs
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {
      /* vidéo sans piste audio */
    }

    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (recorder.onstop = () => r()));

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      onProgress?.(Math.min(0.99, video.currentTime / duration));
      if (!video.ended) raf = requestAnimationFrame(draw);
    };

    recorder.start(1000);
    video.muted = false;
    await video.play();
    draw();
    await new Promise<void>((r) => (video.onended = () => r()));
    cancelAnimationFrame(raf);
    recorder.stop();
    await done;
    audioCtx?.close().catch(() => {});
    onProgress?.(1);

    const type = mime.split(";")[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size || blob.size >= file.size * 0.9) return file;
    const ext = type === "video/mp4" ? "mp4" : "webm";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

export const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
