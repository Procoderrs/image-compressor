import ImageUploader from "@/components/ImageUploader"

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Image Compressor</h1>
    
      <ImageUploader />
    </main>
  );
}