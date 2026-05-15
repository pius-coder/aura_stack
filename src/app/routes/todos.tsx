import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuraQuery, useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { Button } from "@/aura/ui/button";
import { Input } from "@/aura/ui/input";
import { Textarea } from "@/aura/ui/textarea";
import { Label } from "@/aura/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/aura/ui/card";
import { Badge } from "@/aura/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/aura/ui/tabs";
import { Checkbox } from "@/aura/ui/checkbox";
import { Spinner } from "@/aura/ui/spinner";
import { AuraEmptyState, AuraLoadingSkeleton, AuraConfirmDialog } from "@/aura/ui";
import { cn } from "@/lib/utils";
import type { Todo } from "#/aura/entities";

export const Route = createFileRoute("/todos")({
  component: TodosPage,
});

const PRIORITY_VARIANTS = {
  LOW: "secondary",
  MEDIUM: "outline",
  HIGH: "default",
  URGENT: "destructive",
} as const;

const PRIORITY_LABELS = {
  LOW: "Basse",
  MEDIUM: "Moyenne",
  HIGH: "Haute",
  URGENT: "Urgente",
} as const;

function TodosPage() {
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "IN_PROGRESS" | "DONE">("all");

  const { data, isLoading } = useAuraQuery(api.todos.list, {
    input: { numItems: 50, ...(statusFilter !== "all" && { status: statusFilter }) },
  });

  const todos = data?.items ?? [];

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Mes tâches</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Gérez vos tâches manuellement ou laissez l'IA les générer pour vous.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="PENDING">En attente</TabsTrigger>
              <TabsTrigger value="IN_PROGRESS">En cours</TabsTrigger>
              <TabsTrigger value="DONE">Terminées</TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="mt-4">
              {isLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <AuraLoadingSkeleton lines={5} />
                  </CardContent>
                </Card>
              ) : todos.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <AuraEmptyState
                      title="Aucune tâche"
                      description="Créez une tâche manuellement ou utilisez l'IA pour générer une liste."
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {todos.map((todo) => (
                    <TodoItem key={todo.id} todo={todo} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <CreateTodoCard />
          <AiGeneratorCard />
        </div>
      </div>
    </div>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  const toggle = useAuraMutation(api.todos.toggle);
  const remove = useAuraMutation(api.todos.delete);

  const isDone = todo.status === "DONE";

  return (
    <Card className={cn(isDone && "opacity-60")}>
      <CardContent className="flex items-start gap-3 pt-4">
        <Checkbox
          checked={isDone}
          onCheckedChange={() => toggle.mutate({ id: todo.id })}
          className="mt-1"
        />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className={cn("text-sm font-medium", isDone && "line-through")}>{todo.title}</h3>
            <Badge variant={PRIORITY_VARIANTS[todo.priority]} className="text-[10px]">
              {PRIORITY_LABELS[todo.priority]}
            </Badge>
            {todo.aiGenerated && (
              <Badge variant="outline" className="text-[10px]">
                ✨ IA
              </Badge>
            )}
          </div>
          {todo.description && (
            <p className="text-muted-foreground text-xs">{todo.description}</p>
          )}
        </div>
        <AuraConfirmDialog
          title="Supprimer cette tâche ?"
          description="Cette action est irréversible."
          confirmLabel="Supprimer"
          variant="destructive"
          onConfirm={() => remove.mutate({ id: todo.id })}
          trigger={
            <Button variant="ghost" size="icon-sm">
              ✕
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function CreateTodoCard() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");

  const create = useAuraMutation(api.todos.create, {
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle tâche</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            create.mutate({ title, description: description || undefined, priority, aiGenerated: false });
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="todo-title">Titre</Label>
            <Input
              id="todo-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Acheter du pain..."
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="todo-desc">Description</Label>
            <Textarea
              id="todo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionnel..."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="todo-priority">Priorité</Label>
            <select
              id="todo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="border-input bg-background h-7 w-full rounded-md border px-2 text-sm"
            >
              <option value="LOW">Basse</option>
              <option value="MEDIUM">Moyenne</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? "..." : "Ajouter"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AiGeneratorCard() {
  const [goal, setGoal] = useState("");
  const [count, setCount] = useState(5);

  const generate = useAuraMutation(api.todos["ai-generate"], {
    onSuccess: () => {
      setGoal("");
    },
  });

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">✨ Génération IA</CardTitle>
        <CardDescription>
          Décrivez un objectif et l'IA décompose en tâches.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!goal.trim()) return;
            generate.mutate({ goal, count });
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="ai-goal">Objectif</Label>
            <Textarea
              id="ai-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Organiser un voyage à Paris pour 3 jours..."
              rows={3}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-count">Nombre de tâches</Label>
            <Input
              id="ai-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <Button type="submit" disabled={generate.isPending} className="w-full">
            {generate.isPending ? (
              <>
                <Spinner className="mr-2" /> L'IA réfléchit...
              </>
            ) : (
              "Générer avec l'IA"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
