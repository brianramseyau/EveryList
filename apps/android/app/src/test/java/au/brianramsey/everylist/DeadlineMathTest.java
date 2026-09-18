package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

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
    public void nextWeekLandsOnNextMondayFromAWeekday() {
        assertEquals("2026-09-07T14:30", DeadlineMath.nextWeekDeadline("2026-09-01T14:30", NOW));
    }

    @Test
    public void nextWeekSkipsTodayEvenWhenTodayIsAlreadyMonday() {
        assertEquals(
            "2026-09-14",
            DeadlineMath.nextWeekDeadline("2026-09-01", new Date(2026 - 1900, 8, 7, 10, 0))
        );
    }
}
