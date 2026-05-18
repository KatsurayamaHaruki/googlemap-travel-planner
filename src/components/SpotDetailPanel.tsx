"use client";
import { useState, useRef } from "react";
import { X, Clock, Trash2, Image as ImageIcon, ChevronLeft, ChevronRight, ExternalLink, Check } from "lucide-react";
import type { Spot } from "@/types";

interface Props {
  spot: Spot;
  onClose: () => void;
  onUpdate: (data: Partial<Spot>) => void;
  onDelete: () => void;
}

export function SpotDetailPanel({ spot, onClose, onUpdate, onDelete }: Props) {
  const [memo, setMemo] = useState(spot.memo);
  const [startTime, setStartTime] = useState(spot.startTime ?? "");
  const [duration, setDuration] = useState(spot.duration?.toString() ?? "");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function flashSaved() {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 1500);
  }

  function saveAndClose() {
    onUpdate({
      memo,
      startTime: startTime || undefined,
      duration: duration ? parseInt(duration) : undefined,
    });
    onClose();
  }

  function handleStartTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setStartTime(v);
    onUpdate({ startTime: v || undefined });
    flashSaved();
  }

  function handleDurationBlur() {
    onUpdate({ duration: duration ? parseInt(duration) : undefined });
    flashSaved();
  }

  function handleMemoBlur() {
    onUpdate({ memo });
    flashSaved();
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    ).then((dataUrls) => {
      onUpdate({ photos: [...spot.photos, ...dataUrls] });
    });
  }

  function removePhoto(index: number) {
    const next = spot.photos.filter((_, i) => i !== index);
    onUpdate({ photos: next });
    setPhotoIndex(Math.min(photoIndex, next.length - 1));
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="font-semibold text-gray-800 line-clamp-1">{spot.name}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Address */}
        <p className="text-xs text-gray-500">{spot.address}</p>

        {/* Website */}
        {spot.website && (
          <a
            href={spot.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline truncate"
          >
            <ExternalLink size={11} />
            {spot.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}

        {/* Photos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">写真</span>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              <ImageIcon size={12} />
              追加
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
          </div>
          {spot.photos.length > 0 ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100">
              <img src={spot.photos[photoIndex]} alt="" className="h-full w-full object-cover" />
              {spot.photos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIndex((i) => (i - 1 + spot.photos.length) % spot.photos.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setPhotoIndex((i) => (i + 1) % spot.photos.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white">
                    {photoIndex + 1}/{spot.photos.length}
                  </span>
                </>
              )}
              <button
                onClick={() => removePhoto(photoIndex)}
                className="absolute right-2 top-2 rounded-full bg-black/40 p-1 text-white hover:bg-red-500/80"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-8 text-gray-400 hover:border-blue-300 hover:text-blue-400"
            >
              <ImageIcon size={24} />
              <span className="text-xs">写真を追加</span>
            </button>
          )}
        </div>

        {/* Time */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">開始時間</label>
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5">
              <Clock size={14} className="text-gray-400" />
              <input
                type="time"
                value={startTime}
                onChange={handleStartTimeChange}
                className="flex-1 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">滞在時間(分)</label>
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onBlur={handleDurationBlur}
              placeholder="60"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Memo */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">メモ</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={handleMemoBlur}
            placeholder="メモを入力..."
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 p-4 flex gap-3">
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
        >
          <Trash2 size={14} />
          削除
        </button>
        <button
          onClick={saveAndClose}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {saved ? <><Check size={14} />保存済み</> : "保存して閉じる"}
        </button>
      </div>
    </div>
  );
}
