# Rally playback benchmark: dl1

Source: user-provided measurement summary supplied on November 5, 2026. These
values describe one full broadcast (`dl1`), not whichever match excerpt happens
to be available in the local library. They are supplied results, not measurements
reproduced by this web repository.

| Measurement | Duration | Seconds | Share of full video |
| --- | --- | --- | --- |
| Full video | 1:25:20 | 5,120 | 100% |
| Watchable rallies, verified truth | 27:29 | 1,648.8 | 32% |
| Watchable rallies, detector output | 27:38 | 1,657.6 | 32% |

Durations and percentages are rounded for display. The verified total is
32.203125% of the full video, so the homepage shows **68% less footage** and
**32% live play**. The detector produces 8.8 seconds more footage than the verified
total, attributed in the supplied summary to two extra clips of about 4–5 seconds.
This duration difference is not a precision, recall, or detection accuracy score.

Watchable time includes only the main camera while the shuttle is in play. It
excludes replays, other camera angles, and dead time inside rallies. Summing each
rally's first-to-last-frame span instead gives 1:05:41 because those spans still
include other camera angles and dead time. The remaining roughly 20 minutes of
the broadcast are breaks between points and games.

## Homepage presentation

Present these numbers as a **single-broadcast benchmark**, separately from the
playable library excerpt. Use verified play for the primary time comparison and
show detector output as a secondary result. Do not imply every match has the same
ratio or that this benchmark verifies the current excerpt's boundaries.
