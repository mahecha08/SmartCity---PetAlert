import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as mobilenet from '@tensorflow-models/mobilenet';

let cocoModelPromise = null;
let mobilenetModelPromise = null;

export async function loadModels() {
  if (!cocoModelPromise) {
    cocoModelPromise = cocoSsd.load();
  }
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = mobilenet.load({ version: 2, alpha: 1.0 });
  }
  const [cocoModel, mobilenetModel] = await Promise.all([
    cocoModelPromise,
    mobilenetModelPromise,
  ]);
  return { cocoModel, mobilenetModel };
}

export async function analyzePetImage(imageSource) {
  let imgElement;

  if (typeof imageSource === 'string') {
    imgElement = new Image();
    imgElement.crossOrigin = 'anonymous';
    const loadedPromise = new Promise((resolve, reject) => {
      imgElement.onload = () => resolve();
      imgElement.onerror = () => reject(new Error('No se pudo cargar la imagen para análisis.'));
    });
    imgElement.src = imageSource;
    await loadedPromise;
  } else {
    imgElement = imageSource;
  }

  const { cocoModel, mobilenetModel } = await loadModels();

  const predictions = await cocoModel.detect(imgElement);
  const petDetections = predictions.filter(
    (p) => (p.class === 'dog' || p.class === 'cat') && p.score >= 0.5
  );

  if (petDetections.length === 0) {
    return {
      detected: false,
      message: 'No detectamos un perro o un gato en la foto. Probá con otra donde se vea bien la mascota.',
    };
  }

  petDetections.sort((a, b) => b.score - a.score);
  const best = petDetections[0];
  const petType = best.class; // 'dog' | 'cat'
  const percentage = Math.round(best.score * 100);
  const label = petType === 'dog' ? 'un perro' : 'un gato';
  const notice = `Detectamos ${label} (${percentage} %)`;

  // Crop with 10% margin
  const [bx, by, bw, bh] = best.bbox;
  const marginX = bw * 0.1;
  const marginY = bh * 0.1;

  const originalWidth = imgElement.naturalWidth || imgElement.width;
  const originalHeight = imgElement.naturalHeight || imgElement.height;

  const cropX = Math.max(0, bx - marginX);
  const cropY = Math.max(0, by - marginY);
  const cropWidth = Math.min(originalWidth - cropX, bw + 2 * marginX);
  const cropHeight = Math.min(originalHeight - cropY, bh + 2 * marginY);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth));
  canvas.height = Math.max(1, Math.round(cropHeight));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    imgElement,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  let embedding = [];
  const embeddingTensor = mobilenetModel.infer(canvas, true);
  try {
    const rawData = await embeddingTensor.data();
    embedding = Array.from(rawData);
  } finally {
    embeddingTensor.dispose();
  }

  return {
    detected: true,
    petType,
    score: best.score,
    percentage,
    notice,
    embedding,
  };
}
