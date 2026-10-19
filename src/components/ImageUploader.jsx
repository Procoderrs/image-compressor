"use client"
// Client component: uses state, events and browser APIs (File, canvas, URL).

import { useState, useRef } from 'react'
import formatSize from '@/lib/formatSize' // bytes -> "64.0 KB"
import compressImage from '@/lib/compressImage' // (file, value) -> compressed Blob
import JSZip from 'jszip' // builds a .zip in the browser

// Drag and drop ignores the <input accept>, so we check the type ourselves.
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

// Checkerboard pattern: shows that transparent areas are transparent.
const CHECKERED = {
  backgroundImage:
    'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%)',
  backgroundSize: '20px 20px',
}

/*
 * DATA SHAPE (one object per image, all inside the `images` list):
 *   id, file (original, never changes), name, size (bytes),
 *   previewUrl, quality (70), colors (64),
 *   + after compressing: compressedBlob, compressedSize, compressedUrl
 *
 * The screen is drawn from this list. Change the list, the screen changes.
 */
export default function ImageUploader() {
  // ======================== STATE ========================
  const [images, setImages] = useState([])
  const [isCompressImage, setIsCompressImage] = useState(false) // true while working
  const [isSelected, setSelected] = useState("") // id of the clicked image
  const [position, setPosition] = useState(50) // divider position, 0 to 100
  const [isDragging, setIsDragging] = useState(false) // divider is being dragged
  const [zipMessage, setZipMessage] = useState("") // text after Download All
  const [isOver, setIsOver] = useState(false) // a file is held over the drop area

  const boxRef = useRef(null) // comparison box (to measure the divider drag)
  const stripRef = useRef(null) // thumbnail strip (for the arrow buttons)

  // ======================== ADDING IMAGES ========================

  // One function for both ways in (Select button and drop).
  function addFiles(fileList) {
    const filesFrom = Array.from(fileList).filter((file) =>
      ACCEPTED.includes(file.type)
    )
    if (filesFrom.length === 0) return

    const output = filesFrom.map((file) => ({
      file: file,
      name: file.name,
      size: file.size,
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      quality: 70,
      colors: 64,
    }))

    setImages((prev) => [...prev, ...output])
  }

  function handleFileChange(e) {
    addFiles(e.target.files)
    e.target.value = '' // lets the same file be chosen again
  }

  // ---- drag and drop of files from the computer ----
  function handleDragOver(e) {
    e.preventDefault() // "dropping here is allowed"
    setIsOver(true)
  }

  function handleDragLeave(e) {
    // Ignore the event when the pointer only moved onto a child element.
    if (e.currentTarget.contains(e.relatedTarget)) return
    setIsOver(false)
  }

  function handleDrop(e) {
    e.preventDefault() // stop the browser from opening the file
    setIsOver(false)
    addFiles(e.dataTransfer.files)
  }

  // ======================== COMPRESSING ========================

  function updateImage(id, changes) {
    setImages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...changes } : item))
    )
  }

  async function compressOne(img) {
    if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)

    // PNG -> colors (8 to 256). Others -> quality, 70 becomes 0.7.
    const isPng = img.file.type === 'image/png'
    const value = isPng ? img.colors : img.quality / 100

    // Always from the ORIGINAL file, never from an earlier result.
    const blob = await compressImage(img.file, value)

    updateImage(img.id, {
      compressedBlob: blob,
      compressedSize: blob.size,
      compressedUrl: URL.createObjectURL(blob),
    })
  }

  // Compress every image that is not compressed yet, one by one.
  async function handleCompress() {
    setIsCompressImage(true)
    try {
      for (const img of images) {
        if (img.compressedBlob) continue
        await compressOne(img)
      }
    } finally {
      setIsCompressImage(false)
    }
  }

  // Re-compress ONLY the selected image with its own slider value.
  async function handleApply() {
    if (!selectedImage) return
    setIsCompressImage(true)
    try {
      await compressOne(selectedImage)
    } finally {
      setIsCompressImage(false)
    }
  }

  // ======================== REMOVING ========================

  function revokeLinks(img) {
    URL.revokeObjectURL(img.previewUrl)
    if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)
  }

  function handleRemove(id) {
    const target = images.find((item) => item.id === id)
    revokeLinks(target)
    if (isSelected === id) setSelected(null)
    setImages((prev) => prev.filter((item) => item.id !== id))
  }

  // NEW: remove every image and free all their links.
  function handleClear() {
    images.forEach(revokeLinks)
    setImages([])
    setSelected("")
    setZipMessage("")
  }

  // ======================== STRIP ARROWS ========================

  // NEW: scroll the thumbnail strip left (-1) or right (+1).
  function scrollStrip(direction) {
    stripRef.current.scrollBy({ left: direction * 300, behavior: 'smooth' })
  }

  // ======================== DIVIDER DRAG ========================

  function handleDown() {
    setIsDragging(true)
  }

  function handleUp() {
    setIsDragging(false)
  }

  function handleMove(e) {
    if (!isDragging) return
    const rect = boxRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left // mouse x inside the box
    const percent = (x / rect.width) * 100 // pixels -> percent
    setPosition(Math.min(100, Math.max(0, percent))) // clamp to 0..100
  }

  // ======================== DOWNLOADS ========================

  function getDownloadName(name) {
    const dot = name.lastIndexOf('.')
    if (dot === -1) return `${name} - compressed`
    return `${name.slice(0, dot)} - compressed${name.slice(dot)}`
  }

  // Derived values: calculated on every render, never stored.
  const selectedImage = images.find((item) => item.id === isSelected)
  const pendingCount = images.filter((img) => !img.compressedBlob).length
  const readyImages = images.filter(
    (img) => img.compressedBlob && img.compressedSize < img.size
  )

  // How much smaller an image became, as a whole number.
  function percentSaved(img) {
    return (((img.size - img.compressedSize) / img.size) * 100).toFixed(0)
  }

  async function handleDownloadAll() {
    if (readyImages.length === 0) return

    const zip = new JSZip()
    const used = {} // counts names so duplicates do not overwrite each other

    for (const img of readyImages) {
      let name = getDownloadName(img.name)

      if (used[name]) {
        used[name] += 1
        const dot = name.lastIndexOf('.')
        const count = used[name]
        name =
          dot === -1
            ? `${name} (${count})`
            : `${name.slice(0, dot)} (${count})${name.slice(dot)}`
      } else {
        used[name] = 1
      }

      zip.file(name, img.compressedBlob)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'compressed-images.zip'
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setZipMessage(`${readyImages.length} of ${images.length} images downloaded`)
  }

  // ======================== UI ========================

  return (
    <div className="mx-auto max-w-full  pb-16">
      {/* ---------- Header ---------- */}
      <header className="border-b border-slate-200 py-5">
        <img src="/logo.svg" alt=""  className="w-94"/>
      </header>

      {/* ---------- Intro ---------- */}
      <section className="py-10 text-center">
        <h1 className="text-4xl font-bold text-slate-800">
          Compress images in your browser
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Your files never leave your device. Everything is processed locally.
        </p>
      </section>

      <ul className="mx-auto mb-6 max-w-2xl list-disc space-y-1 pl-5 text-slate-700">
        <li>Drop JPEG, PNG or WebP images.</li>
        <li>Click Compress, then save, or adjust quality and apply.</li>
      </ul>

      {/* ---------- Main card ---------- */}
      <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
        {/* Top buttons */}
        <div className="flex justify-center gap-4">
          <label
            htmlFor="imageInput"
            className="cursor-pointer rounded-lg bg-blue-600 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-blue-700"
          >
            ↑ Select files
          </label>
          <input
            id="imageInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            onClick={handleClear}
            disabled={images.length === 0 || isCompressImage}
            className="rounded-lg bg-red-500 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-200"
          >
            ✕ Clear
          </button>
        </div>

        {/* Drop area with the thumbnail strip and arrows */}
        <div className="mt-6 flex items-center gap-2">
          <button
            onClick={() => scrollStrip(-1)}
            disabled={images.length === 0}
            aria-label="Scroll left"
            className="text-4xl text-rose-300 transition hover:text-rose-500 disabled:opacity-40"
          >
            ‹
          </button>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex min-h-52 min-w-0 flex-1 items-center rounded-2xl border-2 border-dashed p-4 transition ${
              isOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-blue-200 bg-white'
            }`}
          >
            {images.length === 0 ? (
              <p className="w-full text-center text-xl font-bold text-blue-300">
                {isOver ? 'Release to add your files' : 'Drop Your Files Here'}
              </p>
            ) : (
              <div
                ref={stripRef}
                className="flex w-full gap-4 overflow-x-auto py-2"
              >
                {images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => setSelected(img.id)}
                    style={CHECKERED}
                    className={`relative h-40 w-40 shrink-0 cursor-pointer overflow-hidden rounded-xl ${
                      isSelected === img.id
                        ? 'ring-4 ring-slate-700'
                        : 'ring-1 ring-slate-300'
                    }`}
                  >
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      draggable={false}
                      className="h-full w-full object-cover"
                    />

                    {/* File name on a dark fade so it is readable on any image */}
                    <div className="absolute inset-x-0 top-0 bg-linear-to-b from-black/60 to-transparent p-2 pr-9">
                      <p className="truncate text-xs font-semibold text-white">
                        {img.name}
                      </p>
                    </div>

                    {/* Remove (cross) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation() // do not select the card
                        handleRemove(img.id)
                      }}
                      aria-label="Remove image"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-white/80 text-xs font-bold text-slate-700 transition hover:bg-red-500 hover:text-white"
                    >
                      ✕
                    </button>

                    {/* Result badge: percent saved, or "already optimized" */}
                    {img.compressedSize &&
                      (img.compressedSize < img.size ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                          <span className="text-3xl font-extrabold text-white drop-shadow">
                            -{percentSaved(img)}%
                          </span>
                        </div>
                      ) : (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                          <span className="rounded bg-white/90 px-2 py-1 text-xs font-bold text-slate-700">
                            Already optimized
                          </span>
                        </div>
                      ))}

                    {/* SAVE strip, only when the image really got smaller */}
                    {img.compressedUrl && img.compressedSize < img.size && (
                      <a
                        href={img.compressedUrl}
                        download={getDownloadName(img.name)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-x-0 bottom-0 bg-emerald-600/90 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-white transition hover:bg-emerald-700"
                      >
                        Save
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => scrollStrip(1)}
            disabled={images.length === 0}
            aria-label="Scroll right"
            className="text-4xl text-rose-300 transition hover:text-rose-500 disabled:opacity-40"
          >
            ›
          </button>
        </div>

        {/* Bottom buttons */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex gap-4">
            <button
              onClick={handleCompress}
              disabled={pendingCount === 0 || isCompressImage}
              className="rounded-lg bg-slate-700 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCompressImage ? 'Compressing...' : '⤡ Compress'}
            </button>

            <div className="relative">
              <button
                onClick={handleDownloadAll}
                disabled={readyImages.length === 0 || isCompressImage}
                className="rounded-lg bg-emerald-600 px-8 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                ⇣ Save all
              </button>
              {/* Count of images that will go into the zip */}
              {readyImages.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-xs font-bold text-white">
                  {readyImages.length}
                </span>
              )}
            </div>
          </div>

          {zipMessage && <p className="text-sm text-slate-600">{zipMessage}</p>}
        </div>
      </div>

      {/* ---------- Detail card for the selected image ---------- */}
      {selectedImage && (
        <div className="mt-8 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
          <h2 className="border-b border-slate-200 pb-4 text-center text-2xl font-bold text-slate-800">
            {selectedImage.name}
          </h2>

          <div className="mt-5 flex gap-5">
            {/* Left: before / after */}
            <div className="min-w-0 flex-1">
              {selectedImage.compressedUrl ? (
                <>
                  <div className="mb-3 flex justify-between text-lg">
                    <span className="text-slate-700">
                      Before:{' '}
                      <strong>{formatSize(selectedImage.size)}</strong>
                    </span>
                    <span className="text-slate-700">
                      After:{' '}
                      <strong className="text-emerald-600">
                        {formatSize(selectedImage.compressedSize)}
                        {selectedImage.compressedSize < selectedImage.size &&
                          ` (-${percentSaved(selectedImage)}%)`}
                      </strong>
                    </span>
                  </div>

                  {/* Two stacked images. The original is cut with clip-path. */}
                  <div
                    ref={boxRef}
                    onPointerMove={handleMove}
                    onPointerDown={handleDown}
                    onPointerUp={handleUp}
                    style={CHECKERED}
                    className="relative h-96 w-full touch-none select-none overflow-hidden rounded-xl ring-1 ring-slate-300"
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

                    {/* Divider line and round handle */}
                    <div
                      className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-slate-500"
                      style={{ left: `${position}%` }}
                    >
                      <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-lg text-slate-700 shadow-lg ring-1 ring-slate-300">
                        ‹ ›
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-96 items-center justify-center rounded-xl bg-slate-50 px-4 ring-1 ring-slate-200">
                  <p className="text-center text-slate-500">
                    This image is not compressed yet. Press Compress.
                  </p>
                </div>
              )}
            </div>

            {/* Right: this image's own slider (PNG -> Colors, others -> Quality) */}
            <div className="flex w-20 shrink-0 flex-col items-center gap-3">
              {selectedImage.file.type === 'image/png' ? (
                <>
                  <span className="text-xl font-bold text-slate-800">
                    Colors
                  </span>
                  <span className="w-full rounded-md border-2 border-slate-700 py-1 text-center text-xl font-bold text-slate-800">
                    {selectedImage.colors}
                  </span>
                  <input
                    type="range"
                    min="8"
                    max="256"
                    step="8"
                    value={selectedImage.colors}
                    onChange={(e) =>
                      updateImage(selectedImage.id, {
                        colors: Number(e.target.value),
                      })
                    }
                    disabled={isCompressImage}
                    aria-label="PNG colors"
                    className="h-72 w-4 cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                </>
              ) : (
                <>
                  <span className="text-xl font-bold text-slate-800">
                    Quality
                  </span>
                  <span className="w-full rounded-md border-2 border-slate-700 py-1 text-center text-xl font-bold text-slate-800">
                    {selectedImage.quality}
                  </span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={selectedImage.quality}
                    onChange={(e) =>
                      updateImage(selectedImage.id, {
                        quality: Number(e.target.value),
                      })
                    }
                    disabled={isCompressImage}
                    aria-label="Compression quality"
                    className="h-72 w-4 cursor-pointer"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                </>
              )}

              {/* Sliders only change a number. Apply re-compresses this image. */}
              <button
                onClick={handleApply}
                disabled={isCompressImage || !selectedImage.compressedBlob}
                className="w-full rounded-lg bg-slate-700 py-2 text-sm font-bold uppercase text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}