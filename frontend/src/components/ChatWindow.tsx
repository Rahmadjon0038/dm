'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, SendHorizontal } from 'lucide-react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import { api, getErrorMessage } from '@/lib/api';
import { contactDisplayName } from '@/lib/format';
import { ConversationListItem, Message } from '@/lib/types';

interface Props {
  conversation: ConversationListItem;
}

export default function ChatWindow({ conversation }: Props) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['messages', conversation.id],
    queryFn: async () => {
      const { data } = await api.get<{ messages: Message[] }>(
        `/conversations/${conversation.id}/messages`,
      );
      return data.messages;
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messagesQuery.data?.length, conversation.id]);

  // Matnga qarab textarea balandligi osadi (maksimal ~7 qator).
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const appendMessage = (message: Message) => {
    queryClient.setQueryData<Message[]>(['messages', conversation.id], (old) => {
      if (!old) return [message];
      if (old.some((m) => m.id === message.id)) return old;
      return [...old, message];
    });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const sendMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const { data } = await api.post<{ message: Message }>(
        `/conversations/${conversation.id}/messages`,
        { text: messageText },
      );
      return data.message;
    },
    onSuccess: (message) => {
      setText('');
      appendMessage(message);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{ message: Message }>(
        `/conversations/${conversation.id}/attachments`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.message;
    },
    onSuccess: appendMessage,
  });

  const reactMutation = useMutation({
    mutationFn: async ({ message, action }: { message: Message; action: 'react' | 'unreact' }) => {
      const { data } = await api.post<{ message: Message }>(
        `/conversations/${conversation.id}/messages/${message.id}/react`,
        { action },
      );
      return data.message;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Message[]>(['messages', conversation.id], (old) =>
        old?.map((m) => (m.id === updated.id ? updated : m)),
      );
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleFileChange = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !uploadMutation.isPending) {
      uploadMutation.mutate(file);
    }
    // Bir xil faylni qayta tanlash ishlashi uchun input tozalanadi.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const name = contactDisplayName(conversation.contact);
  const errorSource = sendMutation.isError
    ? sendMutation.error
    : uploadMutation.isError
      ? uploadMutation.error
      : reactMutation.isError
        ? reactMutation.error
        : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <Avatar src={conversation.contact.profilePictureUrl} name={name} size={38} />
        <div>
          <p className="text-sm font-semibold">{name}</p>
          {conversation.contact.username && (
            <p className="text-xs text-gray-500">@{conversation.contact.username}</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messagesQuery.isLoading && (
          <p className="py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        )}
        {messagesQuery.isError && (
          <p className="py-6 text-center text-sm text-red-500">
            {getErrorMessage(messagesQuery.error)}
          </p>
        )}
        <div className="space-y-2">
          {messagesQuery.data?.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onReact={(msg, action) => reactMutation.mutate({ message: msg, action })}
              reactPending={reactMutation.isPending}
            />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white px-4 py-3">
        {errorSource && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {getErrorMessage(errorSource)}
          </p>
        )}
        {uploadMutation.isPending && (
          <p className="mb-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <Loader2 size={15} className="animate-spin" />
            Fayl yuborilmoqda...
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            title="Rasm, video yoki audio yuborish"
            className="mb-0.5 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-brand-600 disabled:opacity-50"
          >
            <Paperclip size={19} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={1}
            placeholder="Xabar yozing..."
            className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-sm leading-5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={!text.trim() || sendMutation.isPending}
            title="Yuborish (Enter)"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            {sendMutation.isPending ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <SendHorizontal size={17} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
