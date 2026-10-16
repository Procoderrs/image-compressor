"use client"
// "use client" is required: this component uses state (useState), events
// (onClick, onChange, onPointer, onDrop...) and browser APIs (File, canvas, URL).
// Those only exist in the browser, never on the server.

import { useState, useRef } from 'react'
import formatSize from '@/lib/formatSize' // number of bytes -> "64.0 KB"
import compressImage from '@/lib/compressImage' // (file, value) -> compressed Blob
import JSZip from 'jszip' // builds a .zip file in the browser

// The only file types we accept. The <input accept="..."> filter does NOT
// apply to drag and drop, so we check the type ourselves in addFiles().
// It lives outside the component so it is created once, not on every render.
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

/*
 * HOW THE WHOLE COMPONENT FITS TOGETHER
 * -------------------------------------
 * One list called `images` is the single source of truth. Every image is an
 * object. The screen is drawn FROM this list, so changing the list changes
 * the screen.
 *
 *   {
 *     id,               unique id, used for React keys and to find one image
 *     file,             the ORIGINAL File (never changes, always compress from this)
 *     name, size,       shown on the card (size stays a NUMBER in bytes)
 *     previewUrl,       temporary link to show the original
 *     quality: 70,      this image's own JPEG/WebP slider value (10 to 100)
 *     colors: 64,       this image's own PNG slider value (8 to 256)
 *     --- added after compressing ---
 *     compressedBlob, compressedSize, compressedUrl
 *   }
 *
 * Flow:  Select button -> handleFileChange --\
 *                                             >-> addFiles -> images list -> cards
 *        Drop on the box -> handleDrop ------/
 *        Click card -> selected id -> comparison box
 *        Compress / Apply -> compressOne -> updateImage -> cards update
 *        Download All -> handleDownloadAll -> zip
 */
export default function ImageUploader() {
  // ======================== STATE ========================

  // The list of all images (objects described above).
  const [images, setImages] = useState([])

  // true while compressing. Used to disable buttons so the user cannot
  // start a second run while the first one is still working.
  const [isCompressImage, setIsCompressImage] = useState(false)

  // The id of the image the user clicked. NOTE: it holds an id (text), not true/false.
  // A clearer name would be `selectedId`. Initial value "" = nothing selected.
  const [isSelected, setSelected] = useState("")

  // Where the comparison divider is, from 0 to 100 (percent from the left).
  const [position, setPosition] = useState(50)

  // true only while the mouse/finger is held down on the comparison box.
  const [isDragging, setIsDragging] = useState(false)

  // Text shown after "Download All", e.g. "2 of 3 images downloaded".
  const [zipMessage, setZipMessage] = useState("")

  // true while a file is being dragged OVER the upload box.
  // It is only used to highlight the box (change its colors).
  const [isOver, setIsOver] = useState(false)

  // A ref gives us the REAL DOM element of the comparison box, so we can
  // measure its position and width (needed to turn mouse pixels into percent).
  const boxRef = useRef(null)

  // ======================== ADDING IMAGES ========================

  // The ONE function that turns files into image objects.
  // Both ways of adding files (the Select button and drag and drop) call it,
  // because both give us the same thing: a FileList.
  function addFiles(fileList) {
    // Array.from turns the FileList (array-like, no .map) into a real array.
    // filter keeps only JPEG, PNG and WebP, so a PDF or .txt dropped on the
    // box is ignored.
    const filesFrom = Array.from(fileList).filter((file) =>
      ACCEPTED.includes(file.type)
    )

    if (filesFrom.length === 0) return // nothing valid, stop here

    // For each File, build one object for our list (the shape shown at the top).
    const output = filesFrom.map((file) => ({
      file: file,
      name: file.name,
      size: file.size, // number in bytes
      id: crypto.randomUUID(), // unique id for this image
      previewUrl: URL.createObjectURL(file), // link to display the original
      quality: 70, // default for JPEG/WebP
      colors: 64, // default for PNG
    }))

    // Functional update: "prev" is always the latest list.
    // Spread keeps the old images and adds the new ones at the end.
    setImages((prev) => [...prev, ...output])
  }

  // First way in: runs when the user picks files in the hidden <input type="file">.
  function handleFileChange(e) {
    // e.target is the <input>. e.target.files is a FileList.
    addFiles(e.target.files)

    // Reset the input so choosing the SAME file again still fires onChange.
    e.target.value = ''
  }

  // ======================== DRAG AND DROP (files from the computer) ========================
  // These three handlers sit on the upload box. They are different from the
  // comparison divider below: that one is a drag we built ourselves with
  // pointer events, this one uses the browser's built-in drag and drop system.

  // Runs again and again while a file is held over the box.
  function handleDragOver(e) {
    // By default the browser says "you cannot drop here".
    // preventDefault changes that answer to "yes, dropping is allowed".
    // Without this line, onDrop never fires.
    e.preventDefault()
    setIsOver(true) // highlight the box
  }

  // Runs when the dragged file leaves the box.
  function handleDragLeave(e) {
    // dragleave also fires when the file moves onto a child element inside
    // the box (the text, the label). That is not a real exit, and it would
    // make the highlight flicker. relatedTarget is the element we are
    // entering, so if it is still inside the box, ignore this event.
    if (e.currentTarget.contains(e.relatedTarget)) return

    setIsOver(false) // really left the box, remove the highlight
  }

  // Second way in: runs when the user lets go of the file over the box.
  function handleDrop(e) {
    // By default the browser would open the dropped file in the tab and
    // replace our page. preventDefault stops that.
    e.preventDefault()
    setIsOver(false)

    // dataTransfer.files is a FileList, the same kind of thing the input gives.
    addFiles(e.dataTransfer.files)
  }

  // ======================== COMPRESSING ========================

  // Compress ONE image and save the result inside that image's object.
  async function compressOne(img) {
    // If this image was compressed before, free its old link first.
    if (img.compressedUrl) URL.revokeObjectURL(img.compressedUrl)

    // PNG uses "colors" (8 to 256). Everything else uses quality,
    // and canvas wants 0 to 1, so 70 becomes 0.7.
    const isPng = img.file.type === 'image/png'
    const value = isPng ? img.colors : img.quality / 100

    // Always compress from the ORIGINAL file, never from an earlier result.
    // Compressing a compressed image again would keep lowering the quality.
    const blob = await compressImage(img.file, value)

    // Store the result inside this one image's object.
    updateImage(img.id, {
      compressedBlob: blob,
      compressedSize: blob.size, // number, used for the percentage and the zip
      compressedUrl: URL.createObjectURL(blob), // link to display/download it
    })
  }

  // Change a few fields of ONE image without touching the others.
  function updateImage(id, changes) {
    setImages((prev) =>
      prev.map((item) =>
        // Same id -> copy the old object, then overwrite it with `changes`.
        // Later spread wins, so changes.quality replaces item.quality.
        // Different id -> return the object untouched.
        item.id === id ? { ...item, ...changes } : item
      )
    )
  }

  // "Compress Images" button: compress every image that is not compressed yet.
  async function handleCompress() {
    setIsCompressImage(true) // disable buttons
    try {
      // for...of (not map) because we want to WAIT for each image, one by one.
      for (const img of images) {
        if (img.compressedBlob) continue // already done, skip to the next one
        await compressOne(img)
      }
    } finally {
      // finally runs even if something fails, so the buttons never stay disabled.
      setIsCompressImage(false)
    }
  }

  // "Apply" button: compress ONLY the selected image again with its own slider value.
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

  function handleRemove(id) {
    // Find the image BEFORE it leaves the list, so we can free its links.
    const target = images.find((item) => item.id === id)

    URL.revokeObjectURL(target.previewUrl) // original link (every image has one)
    if (target.compressedUrl) {
      URL.revokeObjectURL(target.compressedUrl) // only exists after compressing
    }

    // If the removed image was the selected one, clear the selection
    // so the comparison box does not point at something that no longer exists.
    if (isSelected === id) {
      setSelected(null)
    }

    // filter returns a NEW array without this image (state must never be mutated).
    setImages((prev) => prev.filter((item) => item.id !== id))
  }

  // ======================== DRAGGING THE DIVIDER ========================

  // Pointer events cover mouse, touch and pen with one set of handlers.
  function handleDown() {
    setIsDragging(true) // the user grabbed the box
  }

  function handleUp() {
    setIsDragging(false) // the user let go
  }

  function handleMove(e) {
    if (!isDragging) return // moving without holding down does nothing

    // Where is the box on the screen, and how wide is it?
    const rect = boxRef.current.getBoundingClientRect()

    // Mouse x is measured from the screen's left edge. Subtract the box's
    // left edge to get the distance INSIDE the box.
    const x = e.clientX - rect.left

    // Turn pixels into a percentage of the box width (0 to 100).
    const percent = (x / rect.width) * 100

    // Clamp: never below 0 or above 100, even if the mouse leaves the box.
    const clamped = Math.min(100, Math.max(0, percent))
    setPosition(clamped)
  }

  // ======================== DOWNLOADS ========================

  // "photo.jpg" -> "photo - compressed.jpg"
  function getDownloadName(name) {
    const dot = name.lastIndexOf('.') // position of the last dot
    if (dot === -1) return `${name} - compressed` // no extension
    return `${name.slice(0, dot)} - compressed${name.slice(dot)}`
  }

  // The full object of the clicked image (or undefined if none is selected).
  // This is a derived value: it is calculated on every render, not stored.
  const selectedImage = images.find((item) => item.id === isSelected)

  // "Download All" button: put every successfully compressed image into one zip.
  async function handleDownloadAll() {
    // Only images that were compressed AND really became smaller.
    // "Already optimized" images are left out.
    const ready = images.filter(
      (img) => img.compressedBlob && img.compressedSize < img.size
    )
    if (ready.length === 0) return

    const zip = new JSZip()

    // Counts how many times a file name was used, so two files with the same
    // name do not overwrite each other inside the zip.
    const used = {}

    for (const img of ready) {
      let name = getDownloadName(img.name)

      if (used[name]) {
        // This name was already added: make it "name (2).ext", "name (3).ext"...
        used[name] += 1
        const dot = name.lastIndexOf('.')
        const count = used[name]
        name =
          dot === -1
            ? `${name} (${count})`
            : `${name.slice(0, dot)} (${count})${name.slice(dot)}`
      } else {
        used[name] = 1 // first time we see this name
      }

      zip.file(name, img.compressedBlob) // add the file to the zip
    }

    // Build the zip. This takes time, so it is async: wait for it first,
    // THEN create a link from the finished zip.
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)

    // Trigger a download without showing anything on screen:
    // create an invisible <a>, point it at the zip and click it from code.
    const a = document.createElement('a')
    a.href = url
    a.download = 'compress-images.zip'
    a.click()

    // Free the link a moment later. Revoking instantly can cancel the download
    // in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000)

    setZipMessage(`${ready.length} of ${images.length} images downloaded`)
  }

  // ======================== UI ========================

  return (
    <section className="mx-auto max-w-4xl">
      {/* ---------- Upload area (also the drop zone) ---------- */}
      {/* The three drag handlers turn this box into a drop target.
          The template literal switches the colors while a file is over it. */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          isOver
            ? 'border-indigo-600 bg-indigo-100'
            : 'border-indigo-300 bg-indigo-50'
        }`}
      >
<p className="mb-4 text-slate-600">
  {isOver ? 'Drop your images here' : 'Drag and drop images here, or'}
</p>
        {/* The label is the pretty button. htmlFor matches the input's id,
            so clicking the label clicks the (hidden) input and opens the picker. */}
        <label
          htmlFor="imageInput"
          className="inline-block cursor-pointer rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-6 py-3 font-semibold text-white shadow-md transition hover:from-indigo-700 hover:to-violet-700"
        >
          Select Images
        </label>
        {/* The real input is hidden because its default look cannot be styled.
            onChange gets the function NAME (no brackets): React calls it later. */}
        <input
          id="imageInput"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ---------- Images area ---------- */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Selected Images
        </h2>

        {/* Buttons: shown only when there is at least one image */}
        {images.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex gap-3">
              <button
                onClick={handleCompress}
                disabled={isCompressImage} // disabled while working
                className="rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 px-8 py-3 font-semibold text-white shadow-md transition hover:from-emerald-600 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCompressImage ? 'Compressing...' : 'Compress Images'}
              </button>

              {/* Download All appears only after at least one image is compressed */}
              {images.some((img) => img.compressedBlob) && (
                <button
                  onClick={handleDownloadAll}
                  disabled={isCompressImage}
                  className="rounded-xl bg-slate-800 px-8 py-3 font-semibold text-white shadow-md transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Download All
                </button>
              )}
            </div>

            {zipMessage && (
              <p className="text-sm text-slate-600">{zipMessage}</p>
            )}
          </div>
        )}

        {/* Empty state, or the grid of cards */}
        {images.length === 0 ? (
          <div className="rounded-2xl bg-slate-100 p-10 text-center text-slate-500">
            No images selected
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {/* map #2: turns each image OBJECT into a card on screen */}
            {images.map((img) => (
              <div
                // Arrow function: runs on click, not while rendering.
                onClick={() => setSelected(img.id)}
                key={img.id} // React uses the key to track each card
                // Template literal + ternary: selected card gets a thicker indigo ring.
                className={`relative overflow-hidden rounded-2xl bg-white shadow-md ring-1 ${
                  isSelected === img.id
                    ? 'ring-2 ring-indigo-500'
                    : 'ring-slate-200'
                }`}
              >
                {/* Remove (cross) button */}
                <button
                  onClick={(e) => {
                    // The button is INSIDE the card. Without this, the click
                    // would bubble up and also select the card being removed.
                    e.stopPropagation()
                    handleRemove(img.id)
                  }}
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white transition hover:bg-red-600"
                  aria-label="Remove image"
                >
                  ✕
                </button>

                {/* Preview of the ORIGINAL image */}
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
                    {/* Before size: formatSize turns the number into text */}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      Before: {formatSize(img.size)}
                    </span>

                    {/* Three states of the right-hand badge:
                        1. compressed and smaller  -> After + percentage
                        2. compressed, not smaller -> Already optimized
                        3. never compressed        -> Not compressed */}
                    {img.compressedSize ? (
                      img.compressedSize < img.size ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                          After: {formatSize(img.compressedSize)} (-
                          {/* percentage is CALCULATED here, not stored:
                              (original - new) / original * 100, no decimals */}
                          {(((img.size - img.compressedSize) / img.size) * 100).toFixed(0)}
                          %)
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                          Already optimized
                        </span>
                      )
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                        Not compressed
                      </span>
                    )}
                  </div>

                  {/* Single-image download link, only after compressing */}
                  {img.compressedUrl && (
                    <a
                      href={img.compressedUrl}
                      download={getDownloadName(img.name)}
                      onClick={(e) => e.stopPropagation()} // do not select the card
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

        {/* ---------- Comparison box ---------- */}
        {/* selectedImage is undefined when nothing is selected, so && shows nothing. */}
        {selectedImage && (
          <div className="mt-8 rounded-2xl bg-white p-4 shadow-md ring-1 ring-slate-200">
            <h3 className="mb-4 text-center font-semibold text-slate-800">
              {selectedImage.name}
            </h3>

            <div className="flex gap-4">
              {/* Left side: before/after comparison */}
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

                    {/* Two images stacked on top of each other.
                        ref lets handleMove measure this box.
                        The pointer events start/stop/track the drag.
                        touch-none stops the page from scrolling while dragging on a phone.
                        select-none stops text/image selection while dragging. */}
                    <div
                      ref={boxRef}
                      onPointerMove={handleMove}
                      onPointerDown={handleDown}
                      onPointerUp={handleUp}
                      className="relative mx-auto h-96 w-full touch-none select-none overflow-hidden rounded-lg bg-slate-100"
                    >
                      {/* Bottom layer: the compressed image (fully visible) */}
                      <img
                        src={selectedImage.compressedUrl}
                        alt="Compressed"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain"
                      />

                      {/* Top layer: the original, cut with clip-path.
                          inset(top right bottom left): we cut from the RIGHT by
                          (100 - position)%, so only the left `position`% of the
                          original stays visible. The compressed image shows
                          through the rest. No re-compression happens here,
                          only CSS changes, which is why dragging is smooth. */}
                      <img
                        src={selectedImage.previewUrl}
                        alt="Original"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain"
                        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                      />

                      {/* The divider line and round handle, placed at `position`%.
                          -translate-x-1/2 centers the line on that point. */}
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
                     This image is not compressed yet                    </p>
                  </div>
                )}
              </div>

              {/* Right side: slider for THIS image only.
                  PNG -> Colors slider, everything else -> Quality slider. */}
              <div className="flex shrink-0 flex-col items-center gap-2 self-end">
                {selectedImage.file.type === 'image/png' ? (
                  <>
                    <span className="text-xs font-semibold text-slate-700">
                      {selectedImage.colors}
                    </span>
                    {/* Controlled input: value comes from the image object,
                        onChange writes the new number back into that same object.
                        Number() is needed because e.target.value is always text. */}
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
                      className="h-96 w-4 cursor-pointer"
                      // Makes the range input vertical.
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    />
                    <span className="text-xs font-medium text-slate-500">
                      Colors
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-slate-700">
                      {selectedImage.quality}%
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
                      className="h-96 w-4 cursor-pointer"
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                    />
                    <span className="text-xs font-medium text-slate-500">
                      Quality
                    </span>
                  </>
                )}

                {/* Moving the slider only changes a number in state.
                    Apply is what actually re-compresses this one image.
                    It is disabled until the image has been compressed once. */}
                <button
                  onClick={handleApply}
                  disabled={isCompressImage || !selectedImage.compressedBlob}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}