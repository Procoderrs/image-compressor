import UPNG from 'upng-js'

export default async function compressImage(file, quality) {

  const url= URL.createObjectURL(file)
  const img=new Image()

   await new Promise((resolve)=>{
    img.onload=()=>{
      resolve()
    }
      img.src=url;

   });

   const canvas = document.createElement ("canvas")
canvas.width=img.naturalWidth;
canvas.height=img.naturalHeight;
const ctx=canvas.getContext("2d")
ctx.drawImage(img,0,0)

 let blob
if (file.type === 'image/png') {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
const pixels = imageData.data.buffer
const png = UPNG.encode([pixels], canvas.width, canvas.height, 16)
blob=new Blob([png], {type:'image/png'})
} else {
 
  blob = await new Promise((resolve) => {
    canvas.toBlob((b) => { resolve(b) }, file.type, quality)
  })
} 

URL.revokeObjectURL(url)
console.log(file.name, file.type, "quality:", quality, "blob:", blob.size, "file:", file.size)
if(blob.size >=file.size){
  return file
}
return blob

}

