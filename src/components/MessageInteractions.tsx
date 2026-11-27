"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb } from "@/lib/supabase";
import { useToast } from "@/components/Providers";

export const MESSAGE_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"] as const;
export type MessageReactionEmoji = (typeof MESSAGE_REACTIONS)[number];
export type MessageReactionRow = { message_id: string; user_id: string; emoji: MessageReactionEmoji; conversation_id?: string; group_id?: string; created_at?: string };
export type MessageLike = { id: string; sender_id: string; content: string; image_url: string | null; audio_path?: string | null; deleted_at?: string | null; edited_at?: string | null };
export type ReactionView = { emoji: MessageReactionEmoji; count: number; mine: boolean; users: string[] };

type Kind = "dm" | "group";

export function useMessageInteractions(kind: Kind, scopeId: string, uid: string, messages: MessageLike[]) {
  const toast = useToast();
  const table = kind === "dm" ? "messages" : "group_messages";
  const reactionTable = kind === "dm" ? "dm_message_reactions" : "group_message_reactions";
  const hiddenTable = kind === "dm" ? "dm_message_hidden" : "group_message_hidden";
  const scopeColumn = kind === "dm" ? "conversation_id" : "group_id";
  const [reactionRows, setReactionRows] = useState<MessageReactionRow[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const rowsRef = useRef(reactionRows);
  const hiddenRef = useRef(hiddenIds);
  const locks = useRef(new Set<string>());
  const generation = useRef(0);
  rowsRef.current = reactionRows;
  hiddenRef.current = hiddenIds;

  const load = useCallback(async (requestGeneration: number) => {
    try {
      const [reactions, hidden] = await Promise.all([
        sb().from(reactionTable).select("message_id,user_id,emoji").eq(scopeColumn, scopeId),
        sb().from(hiddenTable).select("message_id").eq(scopeColumn, scopeId).eq("user_id", uid),
      ]);
      if (generation.current !== requestGeneration) return;
      if (!reactions.error) setReactionRows((reactions.data || []) as MessageReactionRow[]);
      if (!hidden.error) setHiddenIds(new Set((hidden.data || []).map((row: { message_id: string }) => row.message_id)));
    } catch { /* A thread stays usable during a temporary network error. */ }
    if (generation.current === requestGeneration) setReady(true);
  }, [hiddenTable, reactionTable, scopeColumn, scopeId, uid]);

  useEffect(() => {
    if (!uid || !scopeId) return;
    const requestGeneration = ++generation.current;
    setReady(false);
    void load(requestGeneration);
    const channel = sb().channel(`message-interactions:${kind}:${scopeId}:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: reactionTable, filter: `${scopeColumn}=eq.${scopeId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as MessageReactionRow;
          setReactionRows((all) => all.some((item) => item.message_id === row.message_id && item.user_id === row.user_id) ? all.map((item) => item.message_id === row.message_id && item.user_id === row.user_id ? row : item) : [...all, row]);
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as MessageReactionRow;
          setReactionRows((all) => all.map((item) => item.message_id === row.message_id && item.user_id === row.user_id ? row : item));
        } else if (payload.eventType === "DELETE") {
          const row = payload.old as MessageReactionRow;
          setReactionRows((all) => all.filter((item) => !(item.message_id === row.message_id && item.user_id === row.user_id)));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: hiddenTable, filter: `${scopeColumn}=eq.${scopeId}` }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { message_id?: string; user_id?: string };
        if (!row.message_id || row.user_id !== uid) return;
        setHiddenIds((previous) => {
          const next = new Set(previous);
          if (payload.eventType === "DELETE") next.delete(row.message_id!); else next.add(row.message_id!);
          return next;
        });
      })
      .subscribe();
    return () => { generation.current += 1; sb().removeChannel(channel); };
  }, [hiddenTable, kind, load, reactionTable, scopeColumn, scopeId, uid]);

  useEffect(() => {
    const ids = [...new Set(reactionRows.map((row) => row.user_id).filter((id) => !profiles[id]))];
    if (!ids.length) return;
    let cancelled = false;
    void sb().from("profiles").select("id,full_name,username").in("id", ids).then(({ data }) => {
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const id of ids) names[id] = "Utilisateur";
      for (const profile of data || []) names[profile.id] = profile.full_name || profile.username || "Utilisateur";
      setProfiles((current) => ({ ...current, ...names }));
    });
    return () => { cancelled = true; };
  }, [profiles, reactionRows]);

  const reactionsByMessage = useMemo(() => {
    const result: Record<string, ReactionView[]> = {};
    for (const row of reactionRows) {
      const list = result[row.message_id] || (result[row.message_id] = []);
      let item = list.find((value) => value.emoji === row.emoji);
      if (!item) { item = { emoji: row.emoji, count: 0, mine: false, users: [] }; list.push(item); }
      item.count += 1;
      item.mine ||= row.user_id === uid;
      item.users.push(profiles[row.user_id] || "Utilisateur");
    }
    return result;
  }, [profiles, reactionRows, uid]);

  const react = useCallback(async (messageId: string, emoji: MessageReactionEmoji) => {
    const message = messages.find((item) => item.id === messageId);
    const lock = `reaction:${messageId}`;
    if (!uid || !message || message.deleted_at || hiddenRef.current.has(messageId) || locks.current.has(lock)) return false;
    locks.current.add(lock);
    let previous: MessageReactionRow[] = [];
    let optimistic = false;
    try {
      const currentMessage = await sb().from(table).select("deleted_at").eq("id", messageId).eq(scopeColumn, scopeId).maybeSingle();
      if (currentMessage.error || !currentMessage.data || currentMessage.data.deleted_at) {
        toast("Ce message n’est plus disponible pour les réactions.", "info");
        return false;
      }
      const allPrevious = rowsRef.current;
      previous = allPrevious.filter((row) => row.message_id === messageId && row.user_id === uid);
      const current = previous[0];
      const next = current?.emoji === emoji
        ? allPrevious.filter((row) => !(row.message_id === messageId && row.user_id === uid))
        : [...allPrevious.filter((row) => !(row.message_id === messageId && row.user_id === uid)), { message_id: messageId, user_id: uid, emoji, [scopeColumn]: scopeId } as MessageReactionRow];
      rowsRef.current = next;
      setReactionRows(next);
      optimistic = true;
      const result = current?.emoji === emoji
        ? await sb().from(reactionTable).delete().eq("message_id", messageId).eq("user_id", uid).eq(scopeColumn, scopeId)
        : await sb().from(reactionTable).upsert({ message_id: messageId, user_id: uid, emoji, [scopeColumn]: scopeId }, { onConflict: "message_id,user_id" });
      if (result.error) throw result.error;
      return true;
    } catch (error) {
      if (optimistic) setReactionRows((all) => {
          const restored = [...all.filter((row) => !(row.message_id === messageId && row.user_id === uid)), ...previous];
          rowsRef.current = restored;
          return restored;
        });
      toast("La réaction n’a pas été enregistrée. Vérifie tes autorisations ou ta connexion.", "error");
      return false;
    } finally { locks.current.delete(lock); }
  }, [messages, reactionTable, scopeColumn, scopeId, toast, uid]);

  const hideForMe = useCallback(async (messageId: string) => {
    if (!uid) return false;
    if (hiddenRef.current.has(messageId) || locks.current.has(`hidden:${messageId}`)) return false;
    locks.current.add(`hidden:${messageId}`);
    const previous = new Set(hiddenRef.current);
    const optimistic = new Set(previous).add(messageId);
    hiddenRef.current = optimistic;
    setHiddenIds(optimistic);
    try {
      const { error } = await sb().from(hiddenTable).insert({ message_id: messageId, user_id: uid, [scopeColumn]: scopeId });
      if (error?.code === "23505") {
        const existing = await sb().from(hiddenTable).select("message_id").eq("message_id", messageId).eq("user_id", uid).maybeSingle();
        if (!existing.error && existing.data) return true;
      }
      if (error) throw error;
      return true;
    } catch {
      hiddenRef.current = previous;
      setHiddenIds(previous);
      toast("Le message n’a pas pu être masqué. Vérifie tes autorisations ou ta connexion.", "error");
      return false;
    } finally { locks.current.delete(`hidden:${messageId}`); }
  }, [hiddenTable, scopeColumn, scopeId, toast, uid]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!message || message.sender_id !== uid || message.deleted_at || message.image_url || message.audio_path || !content.trim()) return false;
    const { data, error } = await sb().from(table).update({ content: content.trim() }).eq("id", messageId).eq(scopeColumn, scopeId).eq("sender_id", uid).is("deleted_at", null).select("*").maybeSingle();
    if (error || !data) { toast("La modification a échoué. Le message a peut-être changé ou tu n’as plus l’autorisation.", "error"); return false; }
    return data as MessageLike;
  }, [messages, scopeColumn, scopeId, table, toast, uid]);

  const deleteForEveryone = useCallback(async (messageId: string) => {
    const message = messages.find((item) => item.id === messageId);
    if (!message || message.sender_id !== uid || message.deleted_at) return false;
    const { data, error } = await sb().from(table).update({ deleted_at: new Date().toISOString() }).eq("id", messageId).eq(scopeColumn, scopeId).eq("sender_id", uid).is("deleted_at", null).select("*").maybeSingle();
    if (error || !data) { toast("La suppression pour tous a échoué. Vérifie tes autorisations ou ta connexion.", "error"); return false; }
    return data as MessageLike;
  }, [messages, scopeColumn, scopeId, table, toast, uid]);

  return { reactionsByMessage, hiddenIds, ready, react, hideForMe, editMessage, deleteForEveryone };
}
