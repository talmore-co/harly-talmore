"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

async function getCroppedBlob(
  imageSrc: string,
  crop: Area,
  output?: { width: number; height: number },
): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const size = Math.min(crop.width, crop.height);
  const outputSize = Math.min(size, 512);
  canvas.width = output?.width ?? outputSize;
  canvas.height = output?.height ?? outputSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
      output ? "image/png" : "image/jpeg",
      0.92,
    );
  });
}

type AvatarCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  onCropComplete: (blob: Blob) => void | Promise<void>;
};

export function AvatarCropDialog(props: AvatarCropDialogProps) {
  return <ImageCropDialog {...props} />;
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
  output,
}: AvatarCropDialogProps & { output?: { width: number; height: number } }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(output ? 1 : 0.5);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onCropDone = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  function resetZoom() {
    setZoom(minZoom);
    setCrop({ x: 0, y: 0 });
  }

  async function handleSave() {
    if (!imageSrc || !croppedArea) return;
    setSaving(true);
    setError("");
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea, output);
      await onCropComplete(blob);
    } catch {
      setError("Could not save this image. Try again or choose another image.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (saving) return;
    if (!next) {
      setZoom(1);
      setMinZoom(output ? 1 : 0.5);
      setCrop({ x: 0, y: 0 });
      setCroppedArea(null);
    }
    onOpenChange(next);
  }

  if (!imageSrc) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] max-w-md flex-col gap-0 overflow-hidden p-0",
          output && "sm:max-w-2xl",
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>
              {output ? "Adjust banner" : "Adjust photo"}
            </DialogTitle>
            <DialogDescription>
              Drag to reposition. Use the slider to zoom in or out.
              {output && ` Output: ${output.width} × ${output.height} pixels.`}
            </DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "relative mx-6 overflow-hidden rounded-2xl bg-muted",
              output ? "h-64 sm:h-80" : "aspect-square",
            )}
          >
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              minZoom={minZoom}
              aspect={output ? output.width / output.height : 1}
              cropShape={output ? "rect" : "round"}
              showGrid={Boolean(output)}
              objectFit={output ? "cover" : "contain"}
              mediaProps={{
                onError: () =>
                  setError(
                    "This image could not be opened. Choose another image.",
                  ),
              }}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropDone}
              onMediaLoaded={(mediaSize) => {
                if (output) return;
                const fitZoom = Math.min(
                  mediaSize.naturalWidth / mediaSize.width,
                  mediaSize.naturalHeight / mediaSize.height,
                  1,
                );
                setMinZoom(Math.max(0.3, fitZoom * 0.5));
              }}
              classes={{
                containerClassName: "!absolute !inset-0",
                mediaClassName: "!max-h-none",
              }}
              style={{
                cropAreaStyle: {
                  border: "3px solid rgba(255,255,255,0.7)",
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                },
              }}
            />
          </div>
          {error && (
            <p role="alert" className="px-6 pb-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-3 px-6 py-4">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(minZoom, z - 0.25))}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
              aria-label="Zoom out"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="range"
              min={minZoom}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className={cn(
                "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none",
                "[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110",
                "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:shadow-sm",
              )}
              aria-label="Zoom level"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
              aria-label="Zoom in"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
              aria-label="Reset position"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !croppedArea}
          >
            {saving ? "Saving…" : output ? "Apply and upload" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
