import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  getWheelState,
  spinWheel,
  wheelPrizesQueryOptions,
  type PendingSpin,
} from "@/lib/wheel.functions";
import { FortuneWheel } from "@/components/fortune-wheel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISS_KEY = "bnv_welcome_wheel_dismissed";

export function formatPrizeLabel(spin: {
  discount_type: string;
  discount_value: number;
}) {
  return spin.discount_type === "percentage"
    ? `-${spin.discount_value} %`
    : `-${spin.discount_value.toLocaleString("fr-FR")} €`;
}

export function useWheelState() {
  const { user } = useAuth();
  const fetchState = useServerFn(getWheelState);
  return useQuery({
    queryKey: ["wheel-state", user?.id ?? null] as const,
    enabled: !!user,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => fetchState(),
  });
}

/**
 * Propose la roue de bienvenue une seule fois par client connecté.
 * L'éligibilité est vérifiée côté serveur (un seul tirage par compte).
 */
export function WelcomeWheelGate() {
  const { user } = useAuth();
  const { data: state } = useWheelState();
  const { data: prizes } = useQuery({
    ...wheelPrizesQueryOptions("welcome"),
    enabled: !!state?.welcomeAvailable,
  });
  const queryClient = useQueryClient();
  const spin = useServerFn(spinWheel);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PendingSpin | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!user || !state?.welcomeAvailable) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(`${DISMISS_KEY}_${user.id}`)) return;
    setOpen(true);
  }, [user, state?.welcomeAvailable]);

  const mutation = useMutation({
    mutationFn: () => spin({ data: { wheel_type: "welcome" as const } }),
    onSuccess: (data) => setResult(data),
    onError: (e) =>
      toast.error("Tirage impossible", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const close = () => {
    if (user && typeof window !== "undefined") {
      localStorage.setItem(`${DISMISS_KEY}_${user.id}`, "1");
    }
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["wheel-state"] });
  };

  if (!user || !state?.welcomeAvailable) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bienvenue ! Tentez votre chance</DialogTitle>
          <DialogDescription>
            Un tirage offert à l'inscription. Le gain est valable 7 jours sur votre
            prochaine commande.
          </DialogDescription>
        </DialogHeader>
        <FortuneWheel
          segments={(prizes ?? []).map((p) => ({ id: p.id, label: p.label }))}
          winningId={result?.prize_id ?? null}
          spinning={mutation.isPending}
          onSettled={() => setRevealed(true)}
        />
        {revealed && result && (
          <p className="text-center text-sm">
            Vous gagnez <strong>{result.label}</strong> ({formatPrizeLabel(result)}) —
            applicable au paiement.
          </p>
        )}
        <DialogFooter>
          {result ? (
            <button
              onClick={close}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Super, merci !
            </button>
          ) : (
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || (prizes ?? []).length === 0}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {mutation.isPending ? "Tirage…" : "Faire tourner la roue"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
