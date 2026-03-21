"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface MediaUploaderProps {
  drillId?: string;
  videoUrl?: string;
  imageUrl?: string;
  onUpload: (type: "video" | "image", url: string) => void;
}

export function MediaUploader({
  drillId,
  videoUrl,
  imageUrl,
  onUpload,
}: MediaUploaderProps) {
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!drillId) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Save the drill first to upload media
      </div>
    );
  }

  async function handleUpload(
    file: File,
    type: "video" | "image"
  ) {
    const setUploading = type === "video" ? setUploadingVideo : setUploadingImage;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch(`/api/v1/admin/drills/${drillId}/media`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();
      onUpload(type, data.url);
    } catch (err) {
      console.error(`Failed to upload ${type}:`, err);
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "video" | "image"
  ) {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file, type);
    }
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Video Upload */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-medium">Video</h4>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e, "video")}
          />
          <div
            onClick={() => !uploadingVideo && videoInputRef.current?.click()}
            className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            {uploadingVideo ? (
              <div className="text-sm text-muted-foreground">
                <span className="animate-pulse">Uploading video...</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                <p className="text-lg mb-1">🎬</p>
                <p>Click to select video</p>
              </div>
            )}
          </div>
          {videoUrl && (
            <p className="text-xs text-muted-foreground truncate">
              Current: {videoUrl}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Image Upload */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-medium">Image</h4>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e, "image")}
          />
          <div
            onClick={() => !uploadingImage && imageInputRef.current?.click()}
            className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            {uploadingImage ? (
              <div className="text-sm text-muted-foreground">
                <span className="animate-pulse">Uploading image...</span>
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt="Drill preview"
                className="max-h-32 mx-auto rounded object-contain"
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                <p className="text-lg mb-1">🖼</p>
                <p>Click to select image</p>
              </div>
            )}
          </div>
          {imageUrl && (
            <p className="text-xs text-muted-foreground truncate">
              Current: {imageUrl}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
