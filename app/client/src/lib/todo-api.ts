import { fetchWithAuth } from "./api";

// --- Types ---

export type TodoStatus = "pending" | "in_progress" | "completed";
export type TodoPriority = "high" | "medium" | "low";

export interface TodoItem {
  id: string;
  title: string;
  description: string | null;
  sourceCategory: string | null;
  sourceQuestionId: string | null;
  sourceAnswer: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface TodoListResponse {
  todos: TodoItem[];
  stats: TodoStats;
}

export interface TodoComment {
  id: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: string;
}

export interface TodoHistoryEntry {
  id: string;
  action: string;
  performedBy: string | null;
  performedByName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TodoDetail {
  todo: TodoItem;
  comments: TodoComment[];
  history: TodoHistoryEntry[];
}

export interface TodoVisibilityMember {
  familyMemberId: string;
  memberName: string;
  hidden: boolean;
}

// --- API functions ---

export async function listTodos(
  creatorId: string,
  filters?: { status?: string; category?: string },
): Promise<TodoListResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  const query = params.toString();
  const path = `/api/todos/${creatorId}${query ? `?${query}` : ""}`;
  const response = await fetchWithAuth(path);
  return response.json() as Promise<TodoListResponse>;
}

export async function getTodoDetail(
  creatorId: string,
  todoId: string,
): Promise<TodoDetail> {
  const response = await fetchWithAuth(`/api/todos/${creatorId}/${todoId}`);
  return response.json() as Promise<TodoDetail>;
}

export async function createTodo(
  creatorId: string,
  data: {
    title: string;
    description?: string;
    sourceCategory?: string;
    sourceQuestionId?: string;
    sourceAnswer?: string;
    assigneeId?: string;
    priority?: TodoPriority;
    dueDate?: string;
  },
): Promise<TodoItem> {
  const response = await fetchWithAuth(`/api/todos/${creatorId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json() as Promise<TodoItem>;
}

export async function updateTodo(
  creatorId: string,
  todoId: string,
  data: {
    title?: string;
    description?: string;
    status?: TodoStatus;
    priority?: TodoPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
  },
): Promise<TodoItem> {
  const response = await fetchWithAuth(`/api/todos/${creatorId}/${todoId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.json() as Promise<TodoItem>;
}

export async function deleteTodo(
  creatorId: string,
  todoId: string,
): Promise<void> {
  await fetchWithAuth(`/api/todos/${creatorId}/${todoId}`, {
    method: "DELETE",
  });
}

export async function addTodoComment(
  creatorId: string,
  todoId: string,
  content: string,
): Promise<TodoComment> {
  const response = await fetchWithAuth(
    `/api/todos/${creatorId}/${todoId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
  return response.json() as Promise<TodoComment>;
}

export async function volunteerForTodo(
  creatorId: string,
  todoId: string,
): Promise<TodoItem> {
  const response = await fetchWithAuth(
    `/api/todos/${creatorId}/${todoId}/volunteer`,
    { method: "POST" },
  );
  return response.json() as Promise<TodoItem>;
}

export async function updateTodoVisibility(
  creatorId: string,
  todoId: string,
  familyMemberId: string,
  hidden: boolean,
): Promise<void> {
  await fetchWithAuth(`/api/todos/${creatorId}/${todoId}/visibility`, {
    method: "POST",
    body: JSON.stringify({ familyMemberId, hidden }),
  });
}

export async function generateTodos(creatorId: string): Promise<TodoItem[]> {
  const response = await fetchWithAuth(`/api/todos/${creatorId}/generate`, {
    method: "POST",
  });
  const data = (await response.json()) as { todos: TodoItem[] };
  return data.todos;
}
