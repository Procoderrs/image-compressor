import UPNG from 'upng-js'

/**
 * compressImage
 * -------------
 * Compresses ONE image inside the browser. Nothing is uploaded to a server.
 *
 * @param {File}   file   The original image the user picked.
 * @param {number} value  The compression setting. Its meaning depends on the type:
 *                          - JPEG / WebP: quality from 0.1 to 1  (canvas quality)
 *                          - PNG:         number of colors, 8 to 256 (UPNG "cnum")
 *                        The caller (ImageUploader) decides which one to send.
 * @returns {Promise<Blob|File>}  The compressed Blob, or the ORIGINAL file if
 *                                compressing made it bigger.
 *
 * The chain of steps (each step needs the result of the one before it):
 *
 *   File -> temporary link -> Image object -> loaded -> canvas -> draw
 *        -> (PNG: pixels -> UPNG)  or  (JPEG/WebP: canvas.toBlob)  -> Blob
 */
export default async function compressImage(file, value) {
  // Step 1: make a temporary link that points at the file in memory.
  // An <img> element can load from this link without any upload.
  const url = URL.createObjectURL(file)

  // Step 2: create an empty Image object (like an <img> tag that is never shown).
  const img = new Image()

  // Step 3: wait until the image has fully loaded.
  // img.onload is an OLD callback-style API, so we wrap it in a Promise.
  // await pauses this function until resolve() is called.
  // If resolve() never runs, await waits forever.
  await new Promise((resolve) => {
    img.onload = () => {
      resolve() // "the wait is over, continue"
    }
    // Setting src starts the loading. onload is set first so we never miss the event.
    img.src = url
  })

  // Step 4: make a canvas with EXACTLY the same width and height as the image.
  // This is why the resolution never changes after compression.
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  // Step 5: get the "brush" (2D context) and paint the image onto the canvas.
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0) // (0, 0) = top-left corner

  // This will hold the result. It is declared with let because both
  // branches below must assign to it.
  let blob

  if (file.type === 'image/png') {
    // ---------- PNG branch: reduce the number of colors ----------
    // canvas.toBlob ignores quality for PNG (PNG is lossless), so we use UPNG.

    // Read every pixel from the canvas. Each pixel = 4 numbers (R, G, B, A).
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // UPNG wants the raw pixel data as an ArrayBuffer.
    const pixels = imageData.data.buffer

    // UPNG.encode(frames, width, height, cnum)
    //   frames : a list of frames, we only have one -> [pixels]
    //   cnum   : max colors in the result (fewer colors = smaller file)
    //            NOTE: 0 would mean "keep all colors", so value must never be 0.
    const png = UPNG.encode([pixels], canvas.width, canvas.height, value)

    // UPNG returns an ArrayBuffer. Wrap it in a Blob so it behaves like a file.
    blob = new Blob([png], { type: 'image/png' })
  } else {
    // ---------- JPEG / WebP branch: use the canvas quality ----------
    // canvas.toBlob is also callback-based, so it gets the same Promise wrapper.
    blob = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => {
          resolve(b) // hand the finished Blob back to "await"
        },
        file.type, // keep the same format (jpeg stays jpeg, webp stays webp)
        value // quality between 0.1 and 1
      )
    })
  }

  // Step 6: free the temporary link. Every createObjectURL must be revoked
  // when it is no longer needed, or the browser keeps the memory.
  URL.revokeObjectURL(url)

  // Step 7: safety rule. Sometimes "compressing" makes a file BIGGER
  // (for example an image that was already optimized). Never give the user
  // a bigger file. Return the original instead. A File is a kind of Blob,
  // so the caller can treat both the same way (.size, createObjectURL...).
  if (blob.size >= file.size) {
    return file
  }

  return blob
}
