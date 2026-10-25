import { fitWithin } from './imageSize'
import { ReceiptError } from './ReceiptApi'

/** 送る写真の長辺の上限（px）。iPhone の写真のままだと API の上限を超える */
const MAX_SIDE = 2000
const JPEG_QUALITY = 0.85

export type PreparedPhoto = { image: string; mediaType: 'image/jpeg' }

/** 写真を長辺 2000px 以下の JPEG に縮め、base64 にする（D-42）。端末から外へは Edge Function にしか送らない */
export async function prepareReceiptPhoto(file: File): Promise<PreparedPhoto> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) throw new Error('toBlob failed')
    return { image: toBase64(new Uint8Array(await blob.arrayBuffer())), mediaType: 'image/jpeg' }
  } catch {
    throw new ReceiptError('写真を読み込めませんでした。別の写真でお試しください')
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
