package au.brianramsey.everylist;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Mirrors functions from apps/web/src/lib/deadline.ts (`addHoursToDeadline`,
 *  `tomorrowDeadline`, `thisWeekendDeadline`, `nextWeekDeadline`, `isOverdue`, `isDueToday`,
 *  `formatDeadline`, `formatDeadlineTime`, `deadlineChip`) and
 *  apps/web/src/lib/notifications/scheduled-deadlines.ts (`triggerDate`) — needed here because
 *  {@link DeadlineNotificationActionReceiver}, {@link RescheduleActivity} and the widget
 *  ({@link WidgetListViewsFactory}) run outside the WebView/JS bundle entirely, so they can't
 *  import either original. Keep all copies in sync — naive local-time math, no timezone
 *  handling, matching the others. See DeadlineMathTest for parity test vectors pinned to the
 *  same ones deadline.spec.ts/scheduled-deadlines.spec.ts use. */
final class DeadlineMath {

    private DeadlineMath() {}

    /** date-only ("2026-09-06") → 9am that day; date+time ("2026-09-06T14:30") → that exact
     *  local time. Mirrors scheduled-deadlines.ts's `triggerDate`. */
    static Calendar triggerDate(String deadline) {
        boolean hasTime = deadline.length() > 10;
        String datePart = deadline.substring(0, 10);
        String[] dateFields = datePart.split("-");
        int year = Integer.parseInt(dateFields[0]);
        int month = Integer.parseInt(dateFields[1]);
        int day = Integer.parseInt(dateFields[2]);

        int hour = 9;
        int minute = 0;
        if (hasTime) {
            String timePart = deadline.substring(11);
            String[] timeFields = timePart.split(":");
            hour = Integer.parseInt(timeFields[0]);
            minute = Integer.parseInt(timeFields[1]);
        }

        Calendar at = Calendar.getInstance();
        at.clear();
        at.set(year, month - 1, day, hour, minute);
        return at;
    }

    /** Mirrors deadline.ts's `addHoursToDeadline`. */
    static String addHoursToDeadline(String deadline, int hours, Date now) {
        Calendar at = triggerDate(deadline);
        at.add(Calendar.HOUR_OF_DAY, hours);

        Calendar earliest = Calendar.getInstance();
        earliest.setTime(now);
        earliest.add(Calendar.HOUR_OF_DAY, hours);

        Calendar target = at.after(earliest) ? at : earliest;

        return String.format(
            Locale.US,
            "%04d-%02d-%02dT%02d:%02d",
            target.get(Calendar.YEAR),
            target.get(Calendar.MONTH) + 1,
            target.get(Calendar.DAY_OF_MONTH),
            target.get(Calendar.HOUR_OF_DAY),
            target.get(Calendar.MINUTE)
        );
    }

    /** Mirrors deadline.ts's `tomorrowDeadline`. */
    static String tomorrowDeadline(String deadline, Date now) {
        Calendar target = Calendar.getInstance();
        target.setTime(now);
        target.add(Calendar.DAY_OF_MONTH, 1);
        return withSameTimeOfDay(deadline, target, now);
    }

    /** Mirrors deadline.ts's `thisWeekendDeadline`. */
    static String thisWeekendDeadline(String deadline, Date now) {
        Calendar target = Calendar.getInstance();
        target.setTime(now);
        int dayOfWeek = target.get(Calendar.DAY_OF_WEEK); // SUNDAY=1 .. SATURDAY=7
        int daysUntilSaturday = (dayOfWeek == Calendar.SUNDAY || dayOfWeek == Calendar.SATURDAY)
            ? 0
            : Calendar.SATURDAY - dayOfWeek;
        target.add(Calendar.DAY_OF_MONTH, daysUntilSaturday);
        return withSameTimeOfDay(deadline, target, now);
    }

    /** Mirrors deadline.ts's `nextWeekDeadline`. */
    static String nextWeekDeadline(String deadline, Date now) {
        Calendar target = Calendar.getInstance();
        target.setTime(now);
        int dayOfWeek = target.get(Calendar.DAY_OF_WEEK); // SUNDAY=1 .. SATURDAY=7
        int daysUntilNextMonday = (9 - dayOfWeek) % 7;
        if (daysUntilNextMonday == 0) daysUntilNextMonday = 7;
        target.add(Calendar.DAY_OF_MONTH, daysUntilNextMonday);
        return withSameTimeOfDay(deadline, target, now);
    }

    /** 'YYYY-MM-DD' for `now`'s local calendar day. Mirrors deadline.ts's `todayLocalIso`. */
    private static String todayLocalIso(Calendar now) {
        return String.format(
            Locale.US, "%04d-%02d-%02d",
            now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
    }

    /** 'YYYY-MM-DDTHH:mm' for `now`'s local clock. Mirrors deadline.ts's `nowLocalMinuteIso`. */
    private static String nowLocalMinuteIso(Calendar now) {
        return todayLocalIso(now)
            + String.format(Locale.US, "T%02d:%02d", now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE));
    }

    /** Mirrors deadline.ts's `hasTime`. */
    private static boolean hasTime(String deadline) {
        return deadline.length() > 10;
    }

    /** Mirrors deadline.ts's `isOverdue` — string comparison rather than a timezone-aware Date,
     *  same reasoning as the rest of this class. */
    static boolean isOverdue(String deadline, Calendar now) {
        String reference = hasTime(deadline) ? nowLocalMinuteIso(now) : todayLocalIso(now);
        return deadline.compareTo(reference) < 0;
    }

    /** Mirrors deadline.ts's `isDueToday`. */
    static boolean isDueToday(String deadline, Calendar now) {
        if (!deadline.substring(0, 10).equals(todayLocalIso(now))) return false;
        return !hasTime(deadline) || !isOverdue(deadline, now);
    }

    /** '2:30 PM' for the deadline's time part, or '' when it has none. Mirrors deadline.ts's
     *  `formatDeadlineTime`. */
    static String formatDeadlineTime(String deadline) {
        if (!hasTime(deadline)) return "";
        return new SimpleDateFormat("h:mm a", Locale.US).format(triggerDate(deadline).getTime());
    }

    /** 'Sep 5' for a date-only deadline, 'Sep 5, 2:30 PM' when a time is set. Mirrors
     *  deadline.ts's `formatDeadline`. */
    static String formatDeadline(String deadline) {
        String dateText = new SimpleDateFormat("MMM d", Locale.US).format(triggerDate(deadline).getTime());
        String timeText = formatDeadlineTime(deadline);
        return timeText.isEmpty() ? dateText : dateText + ", " + timeText;
    }

    /** The list-row chip's text + state for a deadline: red `Overdue (Sep 5, 2:30 PM)`, amber
     *  `Today[, 2:30 PM]`, neutral `Required by Sep 5[, 2:30 PM]`. Mirrors deadline.ts's
     *  `deadlineChip`. */
    static Chip deadlineChip(String deadline, Calendar now) {
        if (isOverdue(deadline, now)) {
            return new Chip("Overdue (" + formatDeadline(deadline) + ")", true, false);
        }
        if (isDueToday(deadline, now)) {
            String time = formatDeadlineTime(deadline);
            return new Chip(time.isEmpty() ? "Today" : "Today, " + time, false, true);
        }
        return new Chip("Required by " + formatDeadline(deadline), false, false);
    }

    /** {@link #deadlineChip}'s result: label text plus which of the two highlighted states (if
     *  either) it's in, so callers can pick a color without re-parsing the label. */
    static final class Chip {
        final String label;
        /** Past the deadline — renders red. */
        final boolean overdue;
        /** Due today (date-only, or a datetime later today) — renders amber. */
        final boolean dueToday;

        Chip(String label, boolean overdue, boolean dueToday) {
            this.label = label;
            this.overdue = overdue;
            this.dueToday = dueToday;
        }
    }

    /** Applies `target`'s date back onto `deadline`, keeping the original's time-of-day when it
     *  had one and falling back to date-only otherwise, floored at `now` — mirrors deadline.ts's
     *  `withSameTimeOfDay` (see its own doc comment for why the floor is needed). */
    private static String withSameTimeOfDay(String deadline, Calendar target, Date now) {
        boolean hasTime = deadline.length() > 10;
        if (!hasTime) {
            return String.format(
                Locale.US,
                "%04d-%02d-%02d",
                target.get(Calendar.YEAR),
                target.get(Calendar.MONTH) + 1,
                target.get(Calendar.DAY_OF_MONTH)
            );
        }

        String[] timeFields = deadline.substring(11).split(":");
        target.set(Calendar.HOUR_OF_DAY, Integer.parseInt(timeFields[0]));
        target.set(Calendar.MINUTE, Integer.parseInt(timeFields[1]));
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);
        if (target.getTime().before(now)) target.setTime(now);
        return String.format(
            Locale.US,
            "%04d-%02d-%02dT%02d:%02d",
            target.get(Calendar.YEAR),
            target.get(Calendar.MONTH) + 1,
            target.get(Calendar.DAY_OF_MONTH),
            target.get(Calendar.HOUR_OF_DAY),
            target.get(Calendar.MINUTE)
        );
    }
}
