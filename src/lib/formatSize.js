

export default function formatSize(bytes){

   if(bytes<1024){
   return `${bytes} bytes`
   }
   else if(Number(bytes < 1024*1024 )){
    const kb=bytes/1024
    
   return `${kb.toFixed(1)} KB`
  }
   else {
   const mb = bytes /1024/1024;
    return `${mb.toFixed(1)} MB`

   }
    
  

}

