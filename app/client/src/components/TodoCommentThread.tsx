import { useState, useCallback } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";
import type { TodoComment } from "../lib/todo-api";

interface TodoCommentThreadProps {
  comments: TodoComment[];
  onAddComment: (content: string) => void;
  isSubmitting: boolean;
}

export function TodoCommentThread({
  comments,
  onAddComment,
  isSubmitting,
}: TodoCommentThreadProps): ReactNode {
  const [newComment, setNewComment] = useState("");

  const handleSubmit = useCallback((): void => {
    const trimmed = newComment.trim();
    if (trimmed.length === 0) return;
    onAddComment(trimmed);
    setNewComment("");
  }, [newComment, onAddComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      setNewComment(e.target.value);
    },
    [],
  );

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">
        {UI_MESSAGES.todo.commentsTitle}
      </h3>

      {comments.length === 0 ? (
        <p className="text-base text-text-secondary">まだメモはありません</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-card border border-border-light bg-bg-surface p-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-text-primary">
                  {comment.authorName ?? UI_MESSAGES.todo.deletedUser}
                </span>
                <span className="text-sm text-text-secondary">
                  {new Date(comment.createdAt).toLocaleDateString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-lg text-text-primary whitespace-pre-wrap">
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Comment input */}
      <div className="flex gap-2">
        <textarea
          className="flex-1 min-h-11 border border-border-light bg-bg-surface px-4 py-3 text-lg rounded-card focus:border-accent-primary focus:outline-none resize-none"
          placeholder={UI_MESSAGES.todo.commentPlaceholder}
          value={newComment}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          type="button"
          className="min-h-11 min-w-11 px-4 rounded-full bg-accent-primary text-text-on-accent text-lg transition-colors active:bg-accent-primary-hover disabled:opacity-50"
          onClick={handleSubmit}
          disabled={isSubmitting || newComment.trim().length === 0}
        >
          {UI_MESSAGES.todo.commentSubmit}
        </button>
      </div>
    </section>
  );
}
