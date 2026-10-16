"use client"
import { useState, useRef } from 'react'
import formatSize from '@/lib/formatSize'
import compressImage from '@/lib/compressImage'

export default function ImageUploader() {
  const [images, setImages] = useState([])
  const [isCompressImage, setIsCompressImage] = useState(false)
  const [isSelected, setSelected] = useState("")
  const [position, setPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [quality, setQuality] = useState(70) // JPEG/WebP: 10 se 100 (percent)
  const [colors, setColors] = useState(64) // PNG: 8 se 256 colors

  const boxRef = useRef(null)

  async function handleFileChange(e) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const filesFrom = Array.from(files)
    const output = filesFrom.map((file) => ({
      file: file,
      name: file.name,
      size: file.size,
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
    }))

    setImages((prev) => [...prev, ...output])
    e.target.value = ''
  }

  async function handleCompress() {
    setIsCompressImage(true)
    try {
      for (const img of images) {
        // purana compressed URL saaf karo (memory leak se bachne ke liye)
        if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)

        // P4b: har image ko uski qism ka number do
        // PNG -> colors (8 se 256), baaqi -> quality (0.1 se 1)
        const isPng = img.file.type === "image/png"
        const value = isPng ? colors : quality / 100

        const blob = await compressImage(img.file, value)
        const compressedUrl = URL.createObjectURL(blob)

        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id
              ? {
                  ...item,
                  compressedBlob: blob,
                  compressedSize: blob.size,
                  compressedUrl: compressedUrl,
                }
              : item
          )
        )
      }
    } finally {
      setIsCompressImage(false)
    }
  }

  function handleRemove(id) {
    const target = images.find((item) => item.id === id)
    URL.revokeObjectURL(target.previewUrl)

    if (target.compressedUrl) {
      URL.revokeObjectURL(target.compressedUrl)
    }
    if (isSelected === id) {
      setSelected(null)
    }
    setImages((prev) => prev.filter((item) => item.id !== id))
  }

  function handleMove(e) {
    if (!isDragging) return
    const rect = boxRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = (x / rect.width) * 100

    const clamped = Math.min(100, Math.max(0, percent))
    setPosition(clamped)
  }

  function handleDown() {
    setIsDragging(true)
  }

  function handleUp() {
    setIsDragging(false)
  }


function getDownloadName(name){

  const dot = name.lastIndexOf(".")
  if (dot===-1) return `${name} - compressed`
  return `${name.slice(0,dot)} - compressed${name.slice(dot)}`

}

  const selectedImage = images.find((item) => item.id === isSelected)

  return (
    <section className="mx-auto max-w-4xl">
      {/* Upload area */}
      <div className="rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-8 text-center">
        <p className="mb-4 text-slate-600">Select JPEG, PNG ya WebP images</p>

        <label
          htmlFor="imageInput"
          className="inline-block cursor-pointer rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-6 py-3 font-semibold text-white shadow-md transition hover:from-indigo-700 hover:to-violet-700"
        >
          Select Images
        </label>
        <input
          id="imageInput"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Images area */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Selected Images
        </h2>

        {/* Compress button */}
        {images.length > 0 && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleCompress}
              disabled={isCompressImage}
              className="rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 px-8 py-3 font-semibold text-white shadow-md transition hover:from-emerald-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCompressImage ? 'Compressing...' : 'Compress Images'}
            </button>
          </div>
        )}

        {images.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 p-10 text-center text-slate-500">
            No images selected
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {images.map((img) => (
              <div
                onClick={() => setSelected(img.id)}
                key={img.id}
                className={`relative overflow-hidden rounded-2xl bg-white shadow-md ring-1 ${
                  isSelected === img.id
                    ? 'ring-2 ring-indigo-500'
                    : 'ring-slate-200'
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(img.id)
                  }}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white transition hover:bg-red-600"
                  aria-label="Remove image"
                >
                  ✕
                </button>

                {/* Preview */}
                <div className="flex h-40 items-center justify-center bg-linear-to-br from-indigo-100 to-violet-200 p-2 text-sm text-indigo-400">
                  <img
                    className="h-40 w-fit"
                    src={img.previewUrl}
                    alt={img.name}
                    draggable={false}
                  />
                </div>

                <div className="p-3">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {img.name}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      Before: {formatSize(img.size)}
                    </span>

                    {img.compressedSize ? (
                      img.compressedSize < img.size ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                          After: {formatSize(img.compressedSize)} (-
                          {(((img.size - img.compressedSize) / img.size) * 100).toFixed(0)}
                          %)
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                          Already optimized
                        </span>
                      )
                    ) : (
                      <span> Not compressed</span>
                    )}
                  </div>

                  {img.compressedUrl && (
  <a
    href={img.compressedUrl}
    download={getDownloadName(img.name)}
    onClick={(e) => e.stopPropagation()}
    className="mt-3 block rounded-lg bg-indigo-600 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-indigo-700"
  >
    Download
  </a>
)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comparison box */}
        {selectedImage && (
          <div className="mt-8 rounded-2xl bg-white p-4 shadow-md ring-1 ring-slate-200">
            <h3 className="mb-4 text-center font-semibold text-slate-800">
              {selectedImage.name}
            </h3>

            <div className="flex gap-4">
              {/* Left: before/after box */}
              <div className="min-w-0 flex-1">
                {selectedImage.compressedUrl ? (
                  <>
                    <div className="mb-3 flex justify-between text-sm font-medium">
                      <span className="text-slate-600">
                        Before: {formatSize(selectedImage.size)}
                      </span>
                      <span className="text-emerald-700">
                        After: {formatSize(selectedImage.compressedSize)}
                      </span>
                    </div>

                    {/* Stacked images */}
                    <div
                      ref={boxRef}
                      onPointerMove={handleMove}
                      onPointerDown={handleDown}
                      onPointerUp={handleUp}
                      className="relative mx-auto h-96 w-full touch-none select-none overflow-hidden rounded-lg bg-slate-100"
                    >
                      <img
                        src={selectedImage.compressedUrl}
                        alt="Compressed"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                      <img
                        src={selectedImage.previewUrl}
                        alt="Original"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain"
                        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                      />

                      {/* Divider line + handle */}
                      <div
                        className="absolute bottom-0 top-0 w-1 -translate-x-1/2 bg-white shadow-md"
                        style={{ left: `${position}%` }}
                      >
                        <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-300">
                          ‹ ›
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-96 items-center justify-center rounded-lg bg-slate-50 px-4">
                    <p className="text-center text-sm text-amber-700">
                      Ye image abhi compress nahi hui. Pehle "Compress Images" dabao.
                    </p>
                  </div>
                )}
              </div>

              {/* Right: vertical slider (PNG -> Colors, baaqi -> Quality) */}
              <div className="flex shrink-0 flex-col items-center gap-2 self-end">
                {selectedImage.file.type === "image/png" ? (
                  <>
                    <span className="text-xs font-semibold text-slate-700">
                      {colors}
                    </span>
                    <input
                      type="range"
                      min="8"
                      max="256"
                      step="8"
                      value={colors}
                      onChange={(e) => setColors(Number(e.target.value))}
                      disabled={isCompressImage}
                      aria-label="PNG colors"
                      className="h-96 w-4 cursor-pointer"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    />
                    <span className="text-xs font-medium text-slate-500">Colors</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-slate-700">
                      {quality}%
                    </span>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      disabled={isCompressImage}
                      aria-label="Compression quality"
                      className="h-96 w-4 cursor-pointer"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    />
                    <span className="text-xs font-medium text-slate-500">Quality</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}