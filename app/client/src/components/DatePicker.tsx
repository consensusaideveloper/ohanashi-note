import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import { UI_MESSAGES } from "../lib/constants";

import type { ReactNode } from "react";

/** Number of days to add for "next week" shortcut. */
const NEXT_WEEK_OFFSET = 7;
/** Number of rows displayed in the calendar grid (6 covers all month layouts). */
const CALENDAR_ROWS = 6;
/** Days per week. */
const DAYS_PER_WEEK = 7;
/** Total cells in the calendar grid. */
const CALENDAR_CELLS = CALENDAR_ROWS * DAYS_PER_WEEK;
/** Index of Sunday in getDay() (0-based). */
const SUNDAY_INDEX = 0;
/** Index of Saturday in getDay() (0-based). */
const SATURDAY_INDEX = 6;

interface DatePickerProps {
  isOpen: boolean;
  selectedDate: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
}

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  dateString: string;
}

/** Formats a Date to YYYY-MM-DD string for value storage. */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}`;
}

/** Returns the start of today (midnight, local time). */
function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Adds days to a date. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Generates calendar grid data for a given year and month. */
function generateCalendarDays(
  year: number,
  month: number,
  today: Date,
  selectedDateString: string,
): CalendarDay[] {
  const firstDayOfMonth = new Date(year, month, 1);
  const startOffset = firstDayOfMonth.getDay();
  const startDate = new Date(year, month, 1 - startOffset);

  const days: CalendarDay[] = [];
  for (let i = 0; i < CALENDAR_CELLS; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateString = toDateString(date);

    days.push({
      date,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: dateString === toDateString(today),
      isSelected: dateString === selectedDateString,
      isPast: date < today,
      dateString,
    });
  }

  return days;
}

/** Formats year/month for the calendar header in Japanese. */
function formatYearMonth(year: number, month: number): string {
  return `${String(year)}年${String(month + 1)}月`;
}

export function DatePicker({
  isOpen,
  selectedDate,
  onConfirm,
  onCancel,
}: DatePickerProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = useMemo(() => getToday(), []);

  const initialDate = useMemo((): Date => {
    if (selectedDate.length > 0) {
      const parsed = new Date(selectedDate);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return today;
  }, [selectedDate, today]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [tentativeDate, setTentativeDate] = useState(selectedDate);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      const date = selectedDate.length > 0 ? new Date(selectedDate) : today;
      setViewYear(date.getFullYear());
      setViewMonth(date.getMonth());
      setTentativeDate(selectedDate);
    }
  }, [isOpen, selectedDate, today]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const calendarDays = useMemo(
    () => generateCalendarDays(viewYear, viewMonth, today, tentativeDate),
    [viewYear, viewMonth, today, tentativeDate],
  );

  // --- Navigation handlers ---
  const handlePrevMonth = useCallback((): void => {
    setViewMonth((prev) => {
      if (prev === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const handleNextMonth = useCallback((): void => {
    setViewMonth((prev) => {
      if (prev === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  // --- Day selection ---
  const handleSelectDay = useCallback((dateString: string): void => {
    setTentativeDate(dateString);
  }, []);

  // --- Shortcut handlers ---
  const handleToday = useCallback((): void => {
    const dateStr = toDateString(today);
    setTentativeDate(dateStr);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }, [today]);

  const handleTomorrow = useCallback((): void => {
    const tomorrow = addDays(today, 1);
    const dateStr = toDateString(tomorrow);
    setTentativeDate(dateStr);
    setViewYear(tomorrow.getFullYear());
    setViewMonth(tomorrow.getMonth());
  }, [today]);

  const handleNextWeek = useCallback((): void => {
    const nextWeek = addDays(today, NEXT_WEEK_OFFSET);
    const dateStr = toDateString(nextWeek);
    setTentativeDate(dateStr);
    setViewYear(nextWeek.getFullYear());
    setViewMonth(nextWeek.getMonth());
  }, [today]);

  const handleClear = useCallback((): void => {
    setTentativeDate("");
  }, []);

  // --- Dialog actions ---
  const handleConfirm = useCallback((): void => {
    onConfirm(tentativeDate);
  }, [tentativeDate, onConfirm]);

  const handleCancelClick = useCallback((): void => {
    onCancel();
  }, [onCancel]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>): void => {
      if (e.target === dialogRef.current) {
        onCancel();
      }
    },
    [onCancel],
  );

  const handleNativeCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>): void => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  const msgs = UI_MESSAGES.datePicker;

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/40 bg-transparent p-0 w-full max-w-md m-auto mb-0 md:mb-auto"
      onClick={handleBackdropClick}
      onCancel={handleNativeCancel}
    >
      <div className="bg-bg-surface rounded-t-card md:rounded-card shadow-lg animate-slide-up">
        {/* Header with cancel / title / confirm */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <button
            type="button"
            className="min-h-11 min-w-11 px-2 text-lg text-text-secondary transition-colors active:text-text-primary"
            onClick={handleCancelClick}
          >
            {msgs.cancel}
          </button>
          <span className="text-xl font-semibold text-text-primary">
            {msgs.title}
          </span>
          <button
            type="button"
            className="min-h-11 min-w-11 px-2 text-lg font-semibold text-accent-primary transition-colors active:text-accent-primary-hover"
            onClick={handleConfirm}
          >
            {msgs.confirm}
          </button>
        </div>

        {/* Quick shortcuts */}
        <div className="flex gap-2 px-5 py-3 border-b border-border-light">
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full border text-lg transition-colors ${
              tentativeDate === toDateString(today)
                ? "bg-accent-primary text-text-on-accent border-accent-primary"
                : "border-border-light text-text-secondary bg-bg-surface active:bg-bg-surface-hover"
            }`}
            onClick={handleToday}
          >
            {msgs.today}
          </button>
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full border text-lg transition-colors ${
              tentativeDate === toDateString(addDays(today, 1))
                ? "bg-accent-primary text-text-on-accent border-accent-primary"
                : "border-border-light text-text-secondary bg-bg-surface active:bg-bg-surface-hover"
            }`}
            onClick={handleTomorrow}
          >
            {msgs.tomorrow}
          </button>
          <button
            type="button"
            className={`min-h-11 flex-1 rounded-full border text-lg transition-colors ${
              tentativeDate === toDateString(addDays(today, NEXT_WEEK_OFFSET))
                ? "bg-accent-primary text-text-on-accent border-accent-primary"
                : "border-border-light text-text-secondary bg-bg-surface active:bg-bg-surface-hover"
            }`}
            onClick={handleNextWeek}
          >
            {msgs.nextWeek}
          </button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between px-5 py-3">
          <button
            type="button"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors active:bg-bg-surface-hover"
            onClick={handlePrevMonth}
            aria-label="前の月"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
          </button>
          <span className="text-xl font-semibold text-text-primary">
            {formatYearMonth(viewYear, viewMonth)}
          </span>
          <button
            type="button"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors active:bg-bg-surface-hover"
            onClick={handleNextMonth}
            aria-label="次の月"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m8.25 4.5 7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-3">
          {msgs.weekdays.map((day, index) => (
            <div
              key={day}
              className={`text-center text-base font-medium py-1 ${
                index === SUNDAY_INDEX
                  ? "text-error"
                  : index === SATURDAY_INDEX
                    ? "text-info"
                    : "text-text-secondary"
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          className="grid grid-cols-7 px-3 pb-2"
          role="grid"
          aria-label={msgs.title}
        >
          {calendarDays.map((calDay) => {
            const handleDayClick = (): void => {
              handleSelectDay(calDay.dateString);
            };

            const dayOfWeek = calDay.date.getDay();
            const isSunday = dayOfWeek === SUNDAY_INDEX;
            const isSaturday = dayOfWeek === SATURDAY_INDEX;

            let textColor = "text-text-primary";
            if (!calDay.isCurrentMonth) {
              textColor = "text-text-secondary opacity-40";
            } else if (calDay.isSelected) {
              textColor = "text-text-on-accent";
            } else if (isSunday) {
              textColor = "text-error";
            } else if (isSaturday) {
              textColor = "text-info";
            }

            return (
              <button
                key={calDay.dateString}
                type="button"
                role="gridcell"
                aria-selected={calDay.isSelected}
                aria-label={`${String(calDay.date.getMonth() + 1)}月${String(calDay.day)}日`}
                className={`min-h-11 min-w-11 flex items-center justify-center rounded-full text-lg transition-colors relative ${textColor} ${
                  calDay.isSelected
                    ? "bg-accent-primary font-semibold"
                    : "active:bg-bg-surface-hover"
                }`}
                onClick={handleDayClick}
              >
                {calDay.day}
                {/* Today indicator dot */}
                {calDay.isToday && !calDay.isSelected && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent-primary"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Clear date button */}
        <div className="px-5 pb-5 pt-2">
          <button
            type="button"
            className={`w-full min-h-11 rounded-full border text-lg transition-colors ${
              tentativeDate.length === 0
                ? "bg-bg-surface-hover text-text-primary border-border font-medium"
                : "border-border-light text-text-secondary bg-bg-surface active:bg-bg-surface-hover"
            }`}
            onClick={handleClear}
          >
            {msgs.clear}
          </button>
        </div>
      </div>
    </dialog>
  );
}
