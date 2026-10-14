

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
const blob=await new Promise((resolve)=>{
  canvas.toBlob((blob)=>{resolve(blob)}, file.type,quality)


})
  URL.revokeObjectURL(url)

return blob;

}

