import { useState, useEffect, useCallback } from "react";

import { listTodos } from "../lib/todo-api";

import type { TodoItem, TodoStats } from "../lib/todo-api";

interface UseTodosReturn {
  todos: TodoItem[];
  stats: TodoStats;
  isLoading: boolean;
  error: boolean;
  refresh: () => void;
  statusFilter: string | null;
  setStatusFilter: (status: string | null) => void;
}

const EMPTY_STATS: TodoStats = {
  total: 0,
  pending: 0,
  inProgress: 0,
  completed: 0,
};

export function useTodos(creatorId: string): UseTodosReturn {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [stats, setStats] = useState<TodoStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const loadTodos = useCallback((): void => {
    setIsLoading(true);
    setError(false);
    const filters = statusFilter ? { status: statusFilter } : undefined;
    void listTodos(creatorId, filters)
      .then((data) => {
        setTodos(data.todos);
        setStats(data.stats);
      })
      .catch((err: unknown) => {
        console.error("Failed to load todos:", { error: err, creatorId });
        setError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [creatorId, statusFilter]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  return {
    todos,
    stats,
    isLoading,
    error,
    refresh: loadTodos,
    statusFilter,
    setStatusFilter,
  };
}
