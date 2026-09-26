package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Calendar;
import java.util.Date;

/** Parity test for {@link DeadlineMath#addHoursToDeadline} — same test vectors as
 *  apps/web/src/lib/deadline.spec.ts's `addHoursToDeadline` describe block, run against this
 *  third (Java) copy of the function for the same reason apps/web/static/push-sw.js's copy is
 *  pinned by deadline-sw-parity.spec.ts: nothing else catches the three drifting silently. */
public class DeadlineMathTest {

    @Test
    public void addsHoursToADatetimeDeadline() {
        assertEquals(
            "2026-09-05T15:30",
            DeadlineMath.addHoursToDeadline("2026-09-05T14:30", 1, new Date(2026 - 1900, 8, 5, 10, 0))
        );
    }

    @Test
    public void rollsOverIntoTheNextDayMonthYear() {
        assertEquals(
            "2026-09-06T00:30",
            DeadlineMath.addHoursToDeadline("2026-09-05T23:30", 1, new Date(2026 - 1900, 8, 5, 12, 0))
        );
        assertEquals(
            "2027-01-01T00:30",
            DeadlineMath.addHoursToDeadline("2026-12-31T23:30", 1, new Date(2026 - 1900, 11, 31, 12, 0))
        );
    }

    @Test
    public void basesADateOnlyDeadlineOff9am() {
        assertEquals(
            "2026-09-05T10:00",
            DeadlineMath.addHoursToDeadline("2026-09-05", 1, new Date(2026 - 1900, 8, 5, 6, 0))
        );
    }

    @Test
    public void fallsBackToNowPlusHoursWhenTheDeadlineHasAlreadyPassed() {
        assertEquals(
            "2026-09-05T16:00",
            DeadlineMath.addHoursToDeadline("2026-09-05T09:00", 1, new Date(2026 - 1900, 8, 5, 15, 0))
        );
        assertEquals(
            "2026-09-05T16:00",
            DeadlineMath.addHoursToDeadline("2020-01-01T09:00", 1, new Date(2026 - 1900, 8, 5, 15, 0))
        );
    }

    @Test
    public void stillUsesTheDeadlinesOwnPlusHoursWhenLaterThanNowPlusHours() {
        assertEquals(
            "2026-09-06T10:00",
            DeadlineMath.addHoursToDeadline("2026-09-06T09:00", 1, new Date(2026 - 1900, 8, 5, 15, 0))
        );
    }

    // NOW is 2026-09-05 15:00 — a Saturday — matching deadline.spec.ts's fixture for the same
    // three shortcuts.
    private static final Date NOW = new Date(2026 - 1900, 8, 5, 15, 0, 0);

    @Test
    public void tomorrowKeepsTheTimeOfDayOnTomorrowsDate() {
        assertEquals("2026-09-06T14:30", DeadlineMath.tomorrowDeadline("2026-09-01T14:30", NOW));
    }

    @Test
    public void tomorrowStaysDateOnlyForADateOnlyDeadline() {
        assertEquals("2026-09-06", DeadlineMath.tomorrowDeadline("2026-09-01", NOW));
    }

    @Test
    public void tomorrowRollsOverMonthYearBoundaries() {
        assertEquals(
            "2027-01-01T09:00",
            DeadlineMath.tomorrowDeadline("2026-12-31T09:00", new Date(2026 - 1900, 11, 31, 12, 0))
        );
    }

    @Test
    public void thisWeekendLandsOnTheComingSaturdayFromAWeekday() {
        // Tuesday 2026-09-08 -> Saturday 2026-09-12.
        assertEquals(
            "2026-09-12T14:30",
            DeadlineMath.thisWeekendDeadline("2026-09-01T14:30", new Date(2026 - 1900, 8, 8, 10, 0))
        );
    }

    @Test
    public void thisWeekendIsTodayWhenTodayIsAlreadySaturdayOrSunday() {
        assertEquals("2026-09-05", DeadlineMath.thisWeekendDeadline("2026-09-01", NOW));
        assertEquals(
            "2026-09-06",
            DeadlineMath.thisWeekendDeadline("2026-09-01", new Date(2026 - 1900, 8, 6, 10, 0))
        );
    }

    @Test
    public void thisWeekendFloorsAtNowWhenTodaysTimeHasAlreadyPassed() {
        // NOW is Saturday 15:00 — reapplying the deadline's 09:00 time-of-day onto today would
        // otherwise land six hours in the past.
        assertEquals("2026-09-05T15:00", DeadlineMath.thisWeekendDeadline("2026-09-01T09:00", NOW));
    }

    @Test
    public void nextWeekAdvancesTheDeadlinesOwnDateByAWeek() {
        // Tuesday 2026-09-01 -> Tuesday 2026-09-08, regardless of what day NOW is.
        assertEquals("2026-09-08T14:30", DeadlineMath.nextWeekDeadline("2026-09-01T14:30", NOW));
    }

    @Test
    public void nextWeekKeepsTheSameWeekdayEvenWhenTheDeadlineIsOnAMonday() {
        // Monday 2026-09-07 deadline -> Monday 2026-09-14, not "today"/next Monday from NOW.
        assertEquals(
            "2026-09-14",
            DeadlineMath.nextWeekDeadline("2026-09-07", new Date(2026 - 1900, 8, 7, 10, 0))
        );
    }

    @Test
    public void nextWeekAdvancesWholeWeeksWhenTheDeadlineIsMoreThanAWeekOverdue() {
        // 2026-08-01 (a Saturday) + 7 is still in the past relative to NOW (Sat 2026-09-05
        // 15:00), so it rolls forward whole weeks — same weekday, same time-of-day, and never an
        // already-overdue result. The timed case lands on the next occurrence of its 09:00, while
        // the date-only one is still "due today" (due by end of day), so 2026-09-05 is fine.
        assertEquals("2026-09-12T09:00", DeadlineMath.nextWeekDeadline("2026-08-01T09:00", NOW));
        assertEquals("2026-09-05", DeadlineMath.nextWeekDeadline("2026-08-01", NOW));
    }

    // Same NOW as deadline.spec.ts's isOverdue/isDueToday/formatDeadline/deadlineChip blocks:
    // 2026-09-05 15:00 local time, a Saturday.
    private static Calendar calendar(int year, int month, int day, int hour, int minute) {
        Calendar cal = Calendar.getInstance();
        cal.clear();
        cal.set(year, month - 1, day, hour, minute);
        return cal;
    }

    private static final Calendar CAL_NOW = calendar(2026, 9, 5, 15, 0);

    @Test
    public void isOverdue_dateOnlyIsDueByEndOfDay() {
        assertFalse(DeadlineMath.isOverdue("2026-09-05", CAL_NOW));
        assertFalse(DeadlineMath.isOverdue("2026-09-05", calendar(2026, 9, 5, 23, 59)));
        assertTrue(DeadlineMath.isOverdue("2026-09-05", calendar(2026, 9, 6, 0, 0)));
    }

    @Test
    public void isOverdue_datetimeIsOverdueTheMinuteAfterItsTimePasses() {
        assertTrue(DeadlineMath.isOverdue("2026-09-05T14:30", CAL_NOW));
        assertFalse(DeadlineMath.isOverdue("2026-09-05T15:00", CAL_NOW));
        assertFalse(DeadlineMath.isOverdue("2026-09-05T15:00", calendar(2026, 9, 5, 15, 0)));
        assertFalse(DeadlineMath.isOverdue("2026-09-05T15:01", calendar(2026, 9, 5, 15, 0)));
        assertTrue(DeadlineMath.isOverdue("2026-09-04T23:59", CAL_NOW));
    }

    @Test
    public void isOverdue_pastAndFutureDates() {
        assertTrue(DeadlineMath.isOverdue("2026-09-04", CAL_NOW));
        assertFalse(DeadlineMath.isOverdue("2026-09-06", CAL_NOW));
    }

    @Test
    public void isDueToday_dateOnlyIsDueTodayAllDay() {
        assertTrue(DeadlineMath.isDueToday("2026-09-05", CAL_NOW));
        assertFalse(DeadlineMath.isDueToday("2026-09-06", CAL_NOW));
        assertFalse(DeadlineMath.isDueToday("2026-09-04", CAL_NOW));
    }

    @Test
    public void isDueToday_datetimeOnlyUntilItsTimePasses() {
        assertTrue(DeadlineMath.isDueToday("2026-09-05T16:00", CAL_NOW));
        assertFalse(DeadlineMath.isDueToday("2026-09-05T14:30", CAL_NOW));
    }

    @Test
    public void formatDeadline_dateOnly() {
        assertEquals("Sep 5", DeadlineMath.formatDeadline("2026-09-05"));
    }

    @Test
    public void formatDeadline_withTime() {
        assertTrue(DeadlineMath.formatDeadline("2026-09-05T14:30").matches("^Sep 5, \\d{1,2}:\\d{2} (AM|PM)$"));
        assertTrue(DeadlineMath.formatDeadlineTime("2026-09-05T14:30").matches("^\\d{1,2}:\\d{2} (AM|PM)$"));
        assertEquals("", DeadlineMath.formatDeadlineTime("2026-09-05"));
    }

    @Test
    public void deadlineChip_neutralRequiredByChipForFutureDeadlines() {
        DeadlineMath.Chip chip = DeadlineMath.deadlineChip("2026-09-11", CAL_NOW);
        assertEquals("Required by Sep 11", chip.label);
        assertFalse(chip.overdue);
        assertFalse(chip.dueToday);
    }

    @Test
    public void deadlineChip_amberTodayChipWithTimeAppendedWhenSet() {
        DeadlineMath.Chip dateOnly = DeadlineMath.deadlineChip("2026-09-05", CAL_NOW);
        assertEquals("Today", dateOnly.label);
        assertFalse(dateOnly.overdue);
        assertTrue(dateOnly.dueToday);

        DeadlineMath.Chip laterToday = DeadlineMath.deadlineChip("2026-09-05T16:00", CAL_NOW);
        assertTrue(laterToday.dueToday);
        assertFalse(laterToday.overdue);
        assertTrue(laterToday.label.matches("^Today, \\d{1,2}:\\d{2} (AM|PM)$"));
    }

    @Test
    public void deadlineChip_redOverdueChipIncludingTheDate() {
        DeadlineMath.Chip overdueDate = DeadlineMath.deadlineChip("2026-09-04", CAL_NOW);
        assertTrue(overdueDate.overdue);
        assertFalse(overdueDate.dueToday);
        assertEquals("Overdue (Sep 4)", overdueDate.label);

        DeadlineMath.Chip overdueTime = DeadlineMath.deadlineChip("2026-09-05T14:30", CAL_NOW);
        assertTrue(overdueTime.overdue);
        assertTrue(overdueTime.label.matches("^Overdue \\(Sep 5, \\d{1,2}:\\d{2} (AM|PM)\\)$"));
    }
}
