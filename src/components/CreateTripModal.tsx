"use client";
import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreate: (data: { title: string; destination: string; startDate: string; endDate: string }) => void;
}

export function CreateTripModal({ onClose, onCreate }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("旅行名を入力してください"); return; }
    if (!destination.trim()) { setError("目的地を入力してください"); return; }
    if (startDate > endDate) { setError("終了日は開始日以降にしてください"); return; }
    onCreate({ title: title.trim(), destination: destination.trim(), startDate, endDate });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
        <h2 className="mb-5 text-xl font-bold text-gray-800">新しい旅行を作成</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">旅行名</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 京都 2泊3日の旅"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">目的地</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="例: 京都"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">出発日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">帰着日</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            作成する
          </button>
        </form>
      </div>
    </div>
  );
}
