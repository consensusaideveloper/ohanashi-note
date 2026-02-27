import { Hono } from "hono";
import { eq, and, desc, inArray } from "drizzle-orm";

import { db } from "../db/connection.js";
import {
  noteLifecycle,
  familyMembers,
  categoryAccess,
  conversations,
  todos,
  todoComments,
  todoHistory,
  todoVisibility,
  users,
} from "../db/schema.js";
import { getFirebaseUid } from "../middleware/auth.js";
import { resolveUserId } from "../lib/users.js";
import { getUserRole } from "../middleware/role.js";
import { logger } from "../lib/logger.js";
import { generateTodosFromNotes } from "../lib/todo-generator.js";
import {
  getActiveFamilyMembers,
  getCreatorName,
  notifyFamilyMembers,
} from "../lib/lifecycle-helpers.js";

import type { Context } from "hono";

// --- Types ---

interface TodoResponseItem {
  id: string;
  title: string;
  description: string | null;
  sourceCategory: string | null;
  sourceQuestionId: string | null;
  sourceAnswer: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CommentResponseItem {
  id: string;
  todoId: string;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: string;
}

interface HistoryResponseItem {
  id: string;
  todoId: string;
  action: string;
  performedBy: string | null;
  performedByName: string | null;
  metadata: unknown;
  createdAt: string;
}

// --- Helpers ---

/**
 * Fetch the noteLifecycle record for a creator and verify that the status
 * is "opened". Returns the lifecycle record on success, or a JSON error
 * Response if the lifecycle is missing or not yet opened.
 */
async function requireOpenedLifecycle(
  c: Context,
  creatorId: string,
): Promise<
  | { ok: true; lifecycle: typeof noteLifecycle.$inferSelect }
  | { ok: false; response: Response }
> {
  const lifecycle = await db.query.noteLifecycle.findFirst({
    where: eq(noteLifecycle.creatorId, creatorId),
  });
  if (!lifecycle || lifecycle.status !== "opened") {
    return {
      ok: false,
      response: c.json(
        { error: "ノートはまだ開封されていません", code: "NOT_OPENED" },
        403,
      ),
    };
  }
  return { ok: true, lifecycle };
}

/**
 * For regular members, get their familyMember ID and accessible categories.
 */
async function getMembershipAndAccessibleCategories(
  userId: string,
  creatorId: string,
  lifecycleId: string,
): Promise<{ familyMemberId: string; categories: string[] } | null> {
  const membership = await db.query.familyMembers.findFirst({
    where: and(
      eq(familyMembers.creatorId, creatorId),
      eq(familyMembers.memberId, userId),
      eq(familyMembers.isActive, true),
    ),
    columns: { id: true },
  });
  if (!membership) return null;

  const accessRows = await db
    .select({ categoryId: categoryAccess.categoryId })
    .from(categoryAccess)
    .where(
      and(
        eq(categoryAccess.lifecycleId, lifecycleId),
        eq(categoryAccess.familyMemberId, membership.id),
      ),
    );

  return {
    familyMemberId: membership.id,
    categories: accessRows.map((r) => r.categoryId),
  };
}

/**
 * Filter todos for non-representative members (category + visibility).
 */
async function filterTodosByAccess(
  allTodos: Array<typeof todos.$inferSelect>,
  familyMemberId: string,
  accessibleCategories: string[],
): Promise<Array<typeof todos.$inferSelect>> {
  // 1. Filter by category
  const categoryFiltered = allTodos.filter(
    (t) =>
      t.sourceCategory !== null &&
      accessibleCategories.includes(t.sourceCategory),
  );

  if (categoryFiltered.length === 0) return [];

  // 2. Filter by visibility (exclude hidden todos)
  const todoIds = categoryFiltered.map((t) => t.id);
  const hiddenRows = await db
    .select({ todoId: todoVisibility.todoId })
    .from(todoVisibility)
    .where(
      and(
        inArray(todoVisibility.todoId, todoIds),
        eq(todoVisibility.familyMemberId, familyMemberId),
      ),
    );
  const hiddenSet = new Set(hiddenRows.map((r) => r.todoId));

  return categoryFiltered.filter((t) => !hiddenSet.has(t.id));
}

/**
 * Build assignee name map from a list of familyMember IDs.
 */
async function buildAssigneeMap(
  assigneeIds: string[],
): Promise<Map<string, string>> {
  if (assigneeIds.length === 0) return new Map();

  const assignees = await db
    .select({
      familyMemberId: familyMembers.id,
      name: users.name,
    })
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.memberId, users.id))
    .where(inArray(familyMembers.id, assigneeIds));

  return new Map(assignees.map((a) => [a.familyMemberId, a.name]));
}

/**
 * Format a todo DB row into an API response item.
 */
function formatTodoResponse(
  todo: typeof todos.$inferSelect,
  assigneeMap: Map<string, string>,
): TodoResponseItem {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    sourceCategory: todo.sourceCategory,
    sourceQuestionId: todo.sourceQuestionId,
    sourceAnswer: todo.sourceAnswer,
    assigneeId: todo.assigneeId,
    assigneeName: todo.assigneeId
      ? (assigneeMap.get(todo.assigneeId) ?? null)
      : null,
    status: todo.status,
    priority: todo.priority,
    dueDate: todo.dueDate ? todo.dueDate.toISOString() : null,
    createdBy: todo.createdBy,
    completedAt: todo.completedAt ? todo.completedAt.toISOString() : null,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/**
 * Get the caller's familyMember ID for a given creator.
 */
async function getCallerFamilyMemberId(
  userId: string,
  creatorId: string,
): Promise<string | null> {
  const membership = await db.query.familyMembers.findFirst({
    where: and(
      eq(familyMembers.creatorId, creatorId),
      eq(familyMembers.memberId, userId),
      eq(familyMembers.isActive, true),
    ),
    columns: { id: true },
  });
  return membership ? membership.id : null;
}

/**
 * Check if a member can see a specific todo (category + visibility check).
 */
async function canMemberSeeTodo(
  todo: typeof todos.$inferSelect,
  familyMemberId: string,
  accessibleCategories: string[],
): Promise<boolean> {
  // Category check
  if (
    todo.sourceCategory === null ||
    !accessibleCategories.includes(todo.sourceCategory)
  ) {
    return false;
  }

  // Visibility check
  const hidden = await db.query.todoVisibility.findFirst({
    where: and(
      eq(todoVisibility.todoId, todo.id),
      eq(todoVisibility.familyMemberId, familyMemberId),
    ),
  });

  return !hidden;
}

// --- Route ---

const todoRoute = new Hono();

/** GET /api/todos/:creatorId - List TODOs */
todoRoute.get("/api/todos/:creatorId", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative" && role !== "member") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Query params for filtering
    const statusFilter = c.req.query("status");
    const categoryFilter = c.req.query("category");

    // Fetch all todos for this lifecycle
    const allTodos = await db
      .select()
      .from(todos)
      .where(eq(todos.lifecycleId, lifecycleResult.lifecycle.id))
      .orderBy(desc(todos.createdAt));

    let todosResult: Array<typeof todos.$inferSelect>;

    if (role === "representative") {
      todosResult = allTodos;
    } else {
      // Member: filter by accessible categories and visibility
      const memberAccess = await getMembershipAndAccessibleCategories(
        userId,
        creatorId,
        lifecycleResult.lifecycle.id,
      );
      if (!memberAccess) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }
      todosResult = await filterTodosByAccess(
        allTodos,
        memberAccess.familyMemberId,
        memberAccess.categories,
      );
    }

    // Apply query param filters
    if (statusFilter) {
      todosResult = todosResult.filter((t) => t.status === statusFilter);
    }
    if (categoryFilter) {
      todosResult = todosResult.filter(
        (t) => t.sourceCategory === categoryFilter,
      );
    }

    // Get assignee names for all todos
    const assigneeIds = todosResult
      .map((t) => t.assigneeId)
      .filter((id): id is string => id !== null);

    const assigneeMap = await buildAssigneeMap(assigneeIds);

    // Compute stats (from unfiltered-by-query-params result for the user's access level)
    const allAccessible = role === "representative" ? allTodos : todosResult; // already filtered by access

    const stats = {
      total: allAccessible.length,
      pending: allAccessible.filter((t) => t.status === "pending").length,
      inProgress: allAccessible.filter((t) => t.status === "in_progress")
        .length,
      completed: allAccessible.filter((t) => t.status === "completed").length,
    };

    return c.json({
      todos: todosResult.map((t) => formatTodoResponse(t, assigneeMap)),
      stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list todos", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      { error: "TODOリストの取得に失敗しました", code: "LIST_TODOS_FAILED" },
      500,
    );
  }
});

/** POST /api/todos/:creatorId - Create TODO */
todoRoute.post("/api/todos/:creatorId", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    const body = await c.req.json<Record<string, unknown>>();
    const title = body["title"];

    if (typeof title !== "string" || title.trim().length === 0) {
      return c.json({ error: "タイトルは必須です", code: "INVALID_BODY" }, 400);
    }

    const description =
      typeof body["description"] === "string" ? body["description"] : null;
    const sourceCategory =
      typeof body["sourceCategory"] === "string"
        ? body["sourceCategory"]
        : null;
    const sourceQuestionId =
      typeof body["sourceQuestionId"] === "string"
        ? body["sourceQuestionId"]
        : null;
    const sourceAnswer =
      typeof body["sourceAnswer"] === "string" ? body["sourceAnswer"] : null;
    const assigneeId =
      typeof body["assigneeId"] === "string" ? body["assigneeId"] : null;
    const priority =
      typeof body["priority"] === "string" ? body["priority"] : "medium";
    const dueDate =
      typeof body["dueDate"] === "string" ? new Date(body["dueDate"]) : null;

    const [created] = await db
      .insert(todos)
      .values({
        lifecycleId: lifecycleResult.lifecycle.id,
        creatorId,
        title: title.trim(),
        description,
        sourceCategory,
        sourceQuestionId,
        sourceAnswer,
        assigneeId,
        priority,
        dueDate,
        createdBy: userId,
      })
      .returning();

    if (!created) {
      return c.json(
        { error: "TODOの作成に失敗しました", code: "CREATE_FAILED" },
        500,
      );
    }

    // Record history
    await db.insert(todoHistory).values({
      todoId: created.id,
      action: "created",
      performedBy: userId,
      metadata: { title: created.title },
    });

    // Build assignee map for response
    const assigneeMap = await buildAssigneeMap(
      created.assigneeId ? [created.assigneeId] : [],
    );

    return c.json(formatTodoResponse(created, assigneeMap), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to create todo", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      { error: "TODOの作成に失敗しました", code: "CREATE_TODO_FAILED" },
      500,
    );
  }
});

/** PATCH /api/todos/:creatorId/:todoId - Update TODO */
todoRoute.patch("/api/todos/:creatorId/:todoId", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");
    const todoId = c.req.param("todoId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative" && role !== "member") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Fetch existing todo
    const existing = await db.query.todos.findFirst({
      where: and(
        eq(todos.id, todoId),
        eq(todos.lifecycleId, lifecycleResult.lifecycle.id),
      ),
    });

    if (!existing) {
      return c.json(
        { error: "TODOが見つかりません", code: "TODO_NOT_FOUND" },
        404,
      );
    }

    // For regular members: verify they are the assignee, and only allow status updates
    if (role === "member") {
      const callerFamilyMemberId = await getCallerFamilyMemberId(
        userId,
        creatorId,
      );
      if (
        !callerFamilyMemberId ||
        existing.assigneeId !== callerFamilyMemberId
      ) {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }
    }

    const body = await c.req.json<Record<string, unknown>>();

    // Build update object and history entries
    const updateFields: Record<string, unknown> = {};
    const historyEntries: Array<{
      action: string;
      metadata: Record<string, unknown>;
    }> = [];

    if (role === "member") {
      // Members can only update status
      if (typeof body["status"] === "string") {
        updateFields["status"] = body["status"];
        historyEntries.push({
          action: "status_changed",
          metadata: { from: existing.status, to: body["status"] },
        });
      }
    } else {
      // Representatives can update all fields
      if (typeof body["title"] === "string") {
        updateFields["title"] = body["title"].trim();
        historyEntries.push({
          action: "title_changed",
          metadata: { from: existing.title, to: body["title"].trim() },
        });
      }
      if (
        typeof body["description"] === "string" ||
        body["description"] === null
      ) {
        updateFields["description"] = body["description"];
        historyEntries.push({
          action: "description_changed",
          metadata: {},
        });
      }
      if (typeof body["status"] === "string") {
        updateFields["status"] = body["status"];
        historyEntries.push({
          action: "status_changed",
          metadata: { from: existing.status, to: body["status"] },
        });
      }
      if (typeof body["priority"] === "string") {
        updateFields["priority"] = body["priority"];
        historyEntries.push({
          action: "priority_changed",
          metadata: { from: existing.priority, to: body["priority"] },
        });
      }
      if (
        typeof body["assigneeId"] === "string" ||
        body["assigneeId"] === null
      ) {
        updateFields["assigneeId"] = body["assigneeId"];
        historyEntries.push({
          action: "assigned",
          metadata: {
            from: existing.assigneeId,
            to: body["assigneeId"],
          },
        });
      }
      if (typeof body["dueDate"] === "string" || body["dueDate"] === null) {
        updateFields["dueDate"] =
          typeof body["dueDate"] === "string"
            ? new Date(body["dueDate"])
            : null;
        historyEntries.push({
          action: "due_date_changed",
          metadata: {},
        });
      }
    }

    // Handle completion tracking
    const newStatus =
      typeof updateFields["status"] === "string"
        ? updateFields["status"]
        : undefined;

    if (newStatus === "completed" && existing.status !== "completed") {
      updateFields["completedAt"] = new Date();
      updateFields["completedBy"] = userId;
    } else if (
      newStatus !== undefined &&
      newStatus !== "completed" &&
      existing.status === "completed"
    ) {
      updateFields["completedAt"] = null;
      updateFields["completedBy"] = null;
    }

    // Always update the updatedAt timestamp
    updateFields["updatedAt"] = new Date();

    const [updated] = await db
      .update(todos)
      .set(updateFields)
      .where(eq(todos.id, todoId))
      .returning();

    if (!updated) {
      return c.json(
        { error: "TODOの更新に失敗しました", code: "UPDATE_FAILED" },
        500,
      );
    }

    // Insert history entries
    for (const entry of historyEntries) {
      await db.insert(todoHistory).values({
        todoId,
        action: entry.action,
        performedBy: userId,
        metadata: entry.metadata,
      });
    }

    // Notify on assignment change
    const assignmentEntry = historyEntries.find((e) => e.action === "assigned");
    if (assignmentEntry && typeof updateFields["assigneeId"] === "string") {
      const assignedMember = await db.query.familyMembers.findFirst({
        where: eq(familyMembers.id, updateFields["assigneeId"]),
        columns: { memberId: true },
      });
      if (assignedMember && assignedMember.memberId !== userId) {
        const creatorName = await getCreatorName(creatorId);
        void notifyFamilyMembers(
          [assignedMember.memberId],
          "todo_assigned",
          `${creatorName}さんのやることリスト`,
          `「${updated.title}」の担当に指定されました`,
          creatorId,
        );
      }
    }

    // Build assignee map for response
    const assigneeMap = await buildAssigneeMap(
      updated.assigneeId ? [updated.assigneeId] : [],
    );

    return c.json(formatTodoResponse(updated, assigneeMap));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to update todo", {
      error: message,
      creatorId: c.req.param("creatorId"),
      todoId: c.req.param("todoId"),
    });
    return c.json(
      { error: "TODOの更新に失敗しました", code: "UPDATE_TODO_FAILED" },
      500,
    );
  }
});

/** DELETE /api/todos/:creatorId/:todoId - Delete TODO */
todoRoute.delete("/api/todos/:creatorId/:todoId", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");
    const todoId = c.req.param("todoId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Verify todo exists and belongs to this lifecycle
    const existing = await db.query.todos.findFirst({
      where: and(
        eq(todos.id, todoId),
        eq(todos.lifecycleId, lifecycleResult.lifecycle.id),
      ),
    });

    if (!existing) {
      return c.json(
        { error: "TODOが見つかりません", code: "TODO_NOT_FOUND" },
        404,
      );
    }

    // Cascade delete handles comments, history, visibility
    await db.delete(todos).where(eq(todos.id, todoId));

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete todo", {
      error: message,
      creatorId: c.req.param("creatorId"),
      todoId: c.req.param("todoId"),
    });
    return c.json(
      { error: "TODOの削除に失敗しました", code: "DELETE_TODO_FAILED" },
      500,
    );
  }
});

/** GET /api/todos/:creatorId/:todoId - Get TODO detail */
todoRoute.get("/api/todos/:creatorId/:todoId", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");
    const todoId = c.req.param("todoId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative" && role !== "member") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Fetch the todo
    const todo = await db.query.todos.findFirst({
      where: and(
        eq(todos.id, todoId),
        eq(todos.lifecycleId, lifecycleResult.lifecycle.id),
      ),
    });

    if (!todo) {
      return c.json(
        { error: "TODOが見つかりません", code: "TODO_NOT_FOUND" },
        404,
      );
    }

    // For members, check access (category + visibility)
    if (role === "member") {
      const memberAccess = await getMembershipAndAccessibleCategories(
        userId,
        creatorId,
        lifecycleResult.lifecycle.id,
      );
      if (!memberAccess) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }

      const canSee = await canMemberSeeTodo(
        todo,
        memberAccess.familyMemberId,
        memberAccess.categories,
      );
      if (!canSee) {
        return c.json(
          {
            error: "このTODOへのアクセス権がありません",
            code: "ACCESS_DENIED",
          },
          403,
        );
      }
    }

    // Build assignee map
    const assigneeMap = await buildAssigneeMap(
      todo.assigneeId ? [todo.assigneeId] : [],
    );

    // Fetch comments with author names
    const commentRows = await db
      .select({
        id: todoComments.id,
        todoId: todoComments.todoId,
        authorId: todoComments.authorId,
        authorName: users.name,
        content: todoComments.content,
        createdAt: todoComments.createdAt,
      })
      .from(todoComments)
      .leftJoin(users, eq(users.id, todoComments.authorId))
      .where(eq(todoComments.todoId, todoId))
      .orderBy(desc(todoComments.createdAt));

    const comments: CommentResponseItem[] = commentRows.map((r) => ({
      id: r.id,
      todoId: r.todoId,
      authorId: r.authorId,
      authorName: r.authorName ?? null,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    }));

    // Fetch history with performer names
    const historyRows = await db
      .select({
        id: todoHistory.id,
        todoId: todoHistory.todoId,
        action: todoHistory.action,
        performedBy: todoHistory.performedBy,
        performedByName: users.name,
        metadata: todoHistory.metadata,
        createdAt: todoHistory.createdAt,
      })
      .from(todoHistory)
      .leftJoin(users, eq(users.id, todoHistory.performedBy))
      .where(eq(todoHistory.todoId, todoId))
      .orderBy(desc(todoHistory.createdAt));

    const history: HistoryResponseItem[] = historyRows.map((r) => ({
      id: r.id,
      todoId: r.todoId,
      action: r.action,
      performedBy: r.performedBy,
      performedByName: r.performedByName ?? null,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    }));

    return c.json({
      todo: formatTodoResponse(todo, assigneeMap),
      comments,
      history,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to get todo detail", {
      error: message,
      creatorId: c.req.param("creatorId"),
      todoId: c.req.param("todoId"),
    });
    return c.json(
      { error: "TODO詳細の取得に失敗しました", code: "GET_TODO_FAILED" },
      500,
    );
  }
});

/** POST /api/todos/:creatorId/:todoId/comments - Add comment */
todoRoute.post("/api/todos/:creatorId/:todoId/comments", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");
    const todoId = c.req.param("todoId");

    const role = await getUserRole(userId, creatorId);

    if (role !== "representative" && role !== "member") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Fetch the todo
    const todo = await db.query.todos.findFirst({
      where: and(
        eq(todos.id, todoId),
        eq(todos.lifecycleId, lifecycleResult.lifecycle.id),
      ),
    });

    if (!todo) {
      return c.json(
        { error: "TODOが見つかりません", code: "TODO_NOT_FOUND" },
        404,
      );
    }

    // For members, check access
    if (role === "member") {
      const memberAccess = await getMembershipAndAccessibleCategories(
        userId,
        creatorId,
        lifecycleResult.lifecycle.id,
      );
      if (!memberAccess) {
        return c.json(
          {
            error: "家族メンバーが見つかりません",
            code: "MEMBER_NOT_FOUND",
          },
          404,
        );
      }

      const canSee = await canMemberSeeTodo(
        todo,
        memberAccess.familyMemberId,
        memberAccess.categories,
      );
      if (!canSee) {
        return c.json(
          {
            error: "このTODOへのアクセス権がありません",
            code: "ACCESS_DENIED",
          },
          403,
        );
      }
    }

    const body = await c.req.json<Record<string, unknown>>();
    const content = body["content"];

    if (typeof content !== "string" || content.trim().length === 0) {
      return c.json(
        { error: "コメント内容は必須です", code: "INVALID_BODY" },
        400,
      );
    }

    const [created] = await db
      .insert(todoComments)
      .values({
        todoId,
        authorId: userId,
        content: content.trim(),
      })
      .returning();

    if (!created) {
      return c.json(
        { error: "コメントの追加に失敗しました", code: "CREATE_FAILED" },
        500,
      );
    }

    // Record history
    await db.insert(todoHistory).values({
      todoId,
      action: "comment_added",
      performedBy: userId,
      metadata: { commentId: created.id },
    });

    // Get author name
    const author = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { name: true },
    });

    const response: CommentResponseItem = {
      id: created.id,
      todoId: created.todoId,
      authorId: created.authorId,
      authorName: author?.name ?? "",
      content: created.content,
      createdAt: created.createdAt.toISOString(),
    };

    // Notify the assignee about the new comment (if different from author)
    const todoRecord = await db.query.todos.findFirst({
      where: eq(todos.id, todoId),
      columns: { assigneeId: true, title: true },
    });
    if (todoRecord?.assigneeId) {
      const assignee = await db.query.familyMembers.findFirst({
        where: eq(familyMembers.id, todoRecord.assigneeId),
        columns: { memberId: true },
      });
      if (assignee && assignee.memberId !== userId) {
        const creatorName = await getCreatorName(creatorId);
        void notifyFamilyMembers(
          [assignee.memberId],
          "todo_comment_added",
          `${creatorName}さんのやることリスト`,
          `「${todoRecord.title}」に新しいメモが追加されました`,
          creatorId,
        );
      }
    }

    return c.json(response, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to add comment", {
      error: message,
      creatorId: c.req.param("creatorId"),
      todoId: c.req.param("todoId"),
    });
    return c.json(
      {
        error: "コメントの追加に失敗しました",
        code: "ADD_COMMENT_FAILED",
      },
      500,
    );
  }
});

/** POST /api/todos/:creatorId/:todoId/volunteer - Self-assign */
todoRoute.post(
  "/api/todos/:creatorId/:todoId/volunteer",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");
      const todoId = c.req.param("todoId");

      const role = await getUserRole(userId, creatorId);

      if (role !== "representative" && role !== "member") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      // Fetch the todo
      const todo = await db.query.todos.findFirst({
        where: and(
          eq(todos.id, todoId),
          eq(todos.lifecycleId, lifecycleResult.lifecycle.id),
        ),
      });

      if (!todo) {
        return c.json(
          { error: "TODOが見つかりません", code: "TODO_NOT_FOUND" },
          404,
        );
      }

      // For members, check access
      if (role === "member") {
        const memberAccess = await getMembershipAndAccessibleCategories(
          userId,
          creatorId,
          lifecycleResult.lifecycle.id,
        );
        if (!memberAccess) {
          return c.json(
            {
              error: "家族メンバーが見つかりません",
              code: "MEMBER_NOT_FOUND",
            },
            404,
          );
        }

        const canSee = await canMemberSeeTodo(
          todo,
          memberAccess.familyMemberId,
          memberAccess.categories,
        );
        if (!canSee) {
          return c.json(
            {
              error: "このTODOへのアクセス権がありません",
              code: "ACCESS_DENIED",
            },
            403,
          );
        }
      }

      // TODO must have no current assignee
      if (todo.assigneeId !== null) {
        return c.json(
          {
            error: "このTODOにはすでに担当者がいます",
            code: "ALREADY_ASSIGNED",
          },
          409,
        );
      }

      // Get the caller's familyMember ID
      const callerFamilyMemberId = await getCallerFamilyMemberId(
        userId,
        creatorId,
      );
      if (!callerFamilyMemberId) {
        return c.json(
          { error: "家族メンバーが見つかりません", code: "MEMBER_NOT_FOUND" },
          404,
        );
      }

      const now = new Date();
      const [updated] = await db
        .update(todos)
        .set({
          assigneeId: callerFamilyMemberId,
          updatedAt: now,
        })
        .where(eq(todos.id, todoId))
        .returning();

      if (!updated) {
        return c.json(
          { error: "TODOの更新に失敗しました", code: "UPDATE_FAILED" },
          500,
        );
      }

      // Record history
      await db.insert(todoHistory).values({
        todoId,
        action: "assigned",
        performedBy: userId,
        metadata: { to: userId },
      });

      // Notify representatives about the volunteer
      const creatorName = await getCreatorName(creatorId);
      const members = await getActiveFamilyMembers(creatorId);
      const repIds = await db
        .select({ memberId: familyMembers.memberId })
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.creatorId, creatorId),
            eq(familyMembers.isActive, true),
            eq(familyMembers.role, "representative"),
          ),
        );
      const repUserIds = repIds
        .map((r) => r.memberId)
        .filter((id) => id !== userId);
      if (repUserIds.length > 0) {
        const volunteerUser = members.find((m) => m.memberId === userId);
        const userName = volunteerUser ? "家族メンバー" : "メンバー";
        void notifyFamilyMembers(
          repUserIds,
          "todo_volunteered",
          `${creatorName}さんのやることリスト`,
          `${userName}が「${updated.title}」の担当に名乗り出ました`,
          creatorId,
        );
      }

      // Build assignee map for response
      const assigneeMap = await buildAssigneeMap([callerFamilyMemberId]);

      return c.json(formatTodoResponse(updated, assigneeMap));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to volunteer for todo", {
        error: message,
        creatorId: c.req.param("creatorId"),
        todoId: c.req.param("todoId"),
      });
      return c.json(
        {
          error: "担当の立候補に失敗しました",
          code: "VOLUNTEER_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/todos/:creatorId/:todoId/visibility - Toggle visibility */
todoRoute.post(
  "/api/todos/:creatorId/:todoId/visibility",
  async (c: Context) => {
    try {
      const firebaseUid = getFirebaseUid(c);
      const userId = await resolveUserId(firebaseUid);
      const creatorId = c.req.param("creatorId");
      const todoId = c.req.param("todoId");

      const role = await getUserRole(userId, creatorId);

      if (role !== "representative") {
        return c.json(
          { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
          403,
        );
      }

      const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
      if (!lifecycleResult.ok) {
        return lifecycleResult.response;
      }

      // Verify todo exists and belongs to this lifecycle
      const todo = await db.query.todos.findFirst({
        where: and(
          eq(todos.id, todoId),
          eq(todos.lifecycleId, lifecycleResult.lifecycle.id),
        ),
      });

      if (!todo) {
        return c.json(
          { error: "TODOが見つかりません", code: "TODO_NOT_FOUND" },
          404,
        );
      }

      const body = await c.req.json<Record<string, unknown>>();
      const familyMemberId = body["familyMemberId"];
      const hidden = body["hidden"];

      if (typeof familyMemberId !== "string" || typeof hidden !== "boolean") {
        return c.json(
          {
            error: "familyMemberId と hidden は必須です",
            code: "INVALID_BODY",
          },
          400,
        );
      }

      if (hidden) {
        // Insert into todoVisibility (ignore duplicate)
        await db
          .insert(todoVisibility)
          .values({
            todoId,
            familyMemberId,
            hiddenBy: userId,
          })
          .onConflictDoNothing();
      } else {
        // Delete from todoVisibility
        await db
          .delete(todoVisibility)
          .where(
            and(
              eq(todoVisibility.todoId, todoId),
              eq(todoVisibility.familyMemberId, familyMemberId),
            ),
          );
      }

      // Record history
      await db.insert(todoHistory).values({
        todoId,
        action: "visibility_changed",
        performedBy: userId,
        metadata: { familyMemberId, hidden },
      });

      return c.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to toggle visibility", {
        error: message,
        creatorId: c.req.param("creatorId"),
        todoId: c.req.param("todoId"),
      });
      return c.json(
        {
          error: "表示設定の変更に失敗しました",
          code: "VISIBILITY_FAILED",
        },
        500,
      );
    }
  },
);

/** POST /api/todos/:creatorId/generate — AI-generate TODOs from note content (representative only). */
todoRoute.post("/api/todos/:creatorId/generate", async (c: Context) => {
  try {
    const firebaseUid = getFirebaseUid(c);
    const userId = await resolveUserId(firebaseUid);
    const creatorId = c.req.param("creatorId");

    const role = await getUserRole(userId, creatorId);
    if (role !== "representative") {
      return c.json(
        { error: "この操作を行う権限がありません", code: "FORBIDDEN" },
        403,
      );
    }

    const lifecycleResult = await requireOpenedLifecycle(c, creatorId);
    if (!lifecycleResult.ok) {
      return lifecycleResult.response;
    }

    // Fetch all conversations with note entries for this creator
    const allConversations = await db
      .select({
        noteEntries: conversations.noteEntries,
        category: conversations.category,
      })
      .from(conversations)
      .where(eq(conversations.userId, creatorId));

    // Extract note entries with category info
    interface RawNoteEntry {
      questionId: string;
      questionTitle: string;
      answer: string;
    }

    const noteEntryInputs: Array<{
      questionId: string;
      questionTitle: string;
      answer: string;
      category: string;
    }> = [];

    for (const conv of allConversations) {
      const entries = conv.noteEntries as RawNoteEntry[] | null;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        if (
          typeof entry.questionId === "string" &&
          typeof entry.answer === "string" &&
          entry.answer.trim().length > 0
        ) {
          noteEntryInputs.push({
            questionId: entry.questionId,
            questionTitle:
              typeof entry.questionTitle === "string"
                ? entry.questionTitle
                : "",
            answer: entry.answer,
            category: typeof conv.category === "string" ? conv.category : "",
          });
        }
      }
    }

    if (noteEntryInputs.length === 0) {
      return c.json({ todos: [] });
    }

    // Deduplicate: keep latest entry per questionId
    const latestByQuestion = new Map<
      string,
      (typeof noteEntryInputs)[number]
    >();
    for (const entry of noteEntryInputs) {
      latestByQuestion.set(entry.questionId, entry);
    }
    const dedupedEntries = [...latestByQuestion.values()];

    // Generate TODOs via AI
    const generatedTodos = await generateTodosFromNotes(dedupedEntries);

    if (generatedTodos.length === 0) {
      return c.json({ todos: [] });
    }

    // Insert generated TODOs into the database
    const createdTodos = [];
    for (const generated of generatedTodos) {
      const [inserted] = await db
        .insert(todos)
        .values({
          lifecycleId: lifecycleResult.lifecycle.id,
          creatorId,
          title: generated.title,
          description: generated.description,
          sourceCategory: generated.sourceCategory,
          sourceQuestionId: generated.sourceQuestionId,
          sourceAnswer: generated.sourceAnswer,
          priority: generated.priority,
          createdBy: userId,
        })
        .returning();

      if (inserted) {
        await db.insert(todoHistory).values({
          todoId: inserted.id,
          action: "created",
          performedBy: userId,
          metadata: { source: "ai_generated" },
        });

        createdTodos.push(
          formatTodoResponse(inserted, new Map<string, string>()),
        );
      }
    }

    logger.info("AI-generated TODOs created", {
      creatorId,
      count: createdTodos.length,
      performedBy: userId,
    });

    return c.json({ todos: createdTodos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to generate TODOs", {
      error: message,
      creatorId: c.req.param("creatorId"),
    });
    return c.json(
      {
        error: "やることリストの自動作成に失敗しました",
        code: "GENERATE_TODOS_FAILED",
      },
      500,
    );
  }
});

export { todoRoute };
