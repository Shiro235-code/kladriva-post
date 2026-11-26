"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";

/** Raccourci vers son propre profil, une fois la session et le profil chargés. */
export default function MePage() {
  const { profile, session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/auth");
    else if (profile) router.replace(`/u/${profile.username}`);
  }, [loading, session, profile, router]);
  return (
    <div className="min-h-screen grid place-items-center">
      <Spinner />
    </div>
  );
}
