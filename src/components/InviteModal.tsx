"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Copy, Plus, Trash2, Users, Link, Check, Crown, Pencil, Eye } from "lucide-react";
import type { TripRole } from "@/types";

interface Member {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  role: TripRole | string;
  joinedAt: string | null;
}

interface InviteLink {
  id: string;
  role: "editor" | "viewer";
  createdAt: string;
  expiresAt?: string | null;
}

interface InviteModalProps {
  tripId: string;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  editor: "編集者",
  viewer: "閲覧者",
};

const ROLE_ICON: Record<string, React.ReactNode> = {
  owner: <Crown size={12} className="text-yellow-500" />,
  editor: <Pencil size={12} className="text-blue-500" />,
  viewer: <Eye size={12} className="text-gray-400" />,
};

function getInviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

export function InviteModal({ tripId, onClose }: InviteModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<"editor" | "viewer">("editor");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"members" | "links">("links");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/trips/${tripId}/invite`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
      setInviteLinks(data.inviteLinks ?? []);
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreateLink() {
    setCreating(true);
    const res = await fetch(`/api/trips/${tripId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const link = await res.json();
      setInviteLinks((prev) => [{ ...link, createdAt: link.createdAt, expiresAt: null }, ...prev]);
    }
    setCreating(false);
  }

  async function handleDeleteLink(linkId: string) {
    const res = await fetch(`/api/trips/${tripId}/invite?linkId=${linkId}`, { method: "DELETE" });
    if (res.ok) setInviteLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  async function handleRemoveMember(userId: string) {
    const res = await fetch(`/api/trips/${tripId}/members?userId=${userId}`, { method: "DELETE" });
    if (res.ok) setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  function copyLink(linkId: string) {
    navigator.clipboard.writeText(getInviteUrl(linkId)).then(() => {
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-800">共有・メンバー管理</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 pt-3">
          <button
            onClick={() => setTab("links")}
            className={`mr-4 pb-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === "links" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-1.5"><Link size={13} />招待リンク</span>
          </button>
          <button
            onClick={() => setTab("members")}
            className={`pb-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === "members" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              メンバー
              <span className="rounded-full bg-gray-100 px-1.5 text-xs text-gray-600">{members.length}</span>
            </span>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            </div>
          ) : tab === "links" ? (
            <div className="space-y-4">
              {/* 新しいリンク生成 */}
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">新しい招待リンクを作成</p>
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => setNewRole("editor")}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${
                      newRole === "editor"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Pencil size={12} className="mx-auto mb-0.5" />
                    編集者
                  </button>
                  <button
                    onClick={() => setNewRole("viewer")}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${
                      newRole === "viewer"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Eye size={12} className="mx-auto mb-0.5" />
                    閲覧者
                  </button>
                </div>
                <button
                  onClick={handleCreateLink}
                  disabled={creating}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {creating ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Plus size={14} />
                  )}
                  リンクを生成
                </button>
              </div>

              {/* 既存のリンク一覧 */}
              {inviteLinks.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">招待リンクはまだありません</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">発行済みリンク</p>
                  {inviteLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {ROLE_ICON[link.role]}
                          <span className="text-xs font-medium text-gray-700">{ROLE_LABEL[link.role]}</span>
                        </div>
                        <p className="truncate text-xs text-gray-400 font-mono">
                          {getInviteUrl(link.id)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => copyLink(link.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                          title="コピー"
                        >
                          {copiedId === link.id ? (
                            <Check size={14} className="text-green-500" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteLink(link.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Members tab */
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center gap-3 rounded-xl p-2 hover:bg-gray-50">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.displayName}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                        {(member.displayName?.[0] ?? "?").toUpperCase()}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{member.displayName}</p>
                    <p className="truncate text-xs text-gray-400">{member.email}</p>
                  </div>
                  {/* Role badge */}
                  <div className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5">
                    {ROLE_ICON[member.role as string]}
                    <span className="text-xs text-gray-600">{ROLE_LABEL[member.role as string] ?? member.role}</span>
                  </div>
                  {/* Remove button (non-owner members) */}
                  {member.role !== "owner" && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="shrink-0 rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      title="メンバーを削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
