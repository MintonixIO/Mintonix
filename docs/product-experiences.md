# Mintonix product experiences

Mintonix has two product experiences: **Entertainment** for badminton fans and
**Technical** for coaches and players. Coaches and players share analysis tools;
the subject can be the player themselves, an athlete they coach, or an opponent.

This document captures the agreed feature brainstorm. It is a product direction,
not a list of shipped capabilities or a committed delivery schedule. The initial
product remains the rally viewer; search, analytics, and expanded 3D experiences
below are planned ideas unless explicitly identified as available elsewhere.

## Entertainment

Find, enjoy, and understand great badminton.

| Feature | Example experience |
| --- | --- |
| Natural-language rally search | “Find long rallies where An Se-young saves a smash and wins the point.” |
| Personalized highlights | Follow favorite players and get highlights featuring preferred shots, close finishes, or long exchanges. |
| Search by rally characteristics | Filter by duration, shot count, shuttle speed, steepness, net clearance, or court coverage. |
| Interactive 3D replay | Rotate a rally, slow it down, and follow the shuttle from different perspectives. |
| “Why was that impressive?” explanations | Explain how a tight net shot forced a lift and created an attacking opportunity. |
| Shot comparison | Overlay two smashes or clears to compare trajectories, speed, and landing locations. |
| Rally prediction games | Pause before a shot and let viewers guess its direction or landing location. |
| Shareable rally cards | Share a clip reference with its 3D trajectory and interesting stats, linking to the original broadcast. |
| Match turning-point timeline | Jump to the longest rally, consecutive-point runs, or changes in shot selection. |

## Technical

Understand patterns, prepare tactics, and improve performance. This combines all
coach features with the overlapping and complementary player features.

| Feature | Combined value for coaches and players |
| --- | --- |
| Playing-style and tendency profiles | Analyze your own game, an athlete, or an opponent: preferred shots, placements, trajectories, and responses to particular situations. |
| Shot-sequence discovery | Find recurring combinations, measure their outcomes, and save successful patterns to revisit before matches. |
| Setup-shot analysis | Identify shots that frequently produce weak replies or create winning opportunities. |
| Serve-and-return analysis | Compare serve placement, return choices, and patterns across the opening shots of a rally. |
| Context-dependent analysis | Compare decisions and outcomes at close scores, late in games, or against different opponents. |
| Trajectory quality and consistency | Measure clear depth, lift height, net clearance, smash angle, and variation across comparable shots. |
| Predictability feedback | Identify situations where shot choice or direction becomes repetitive and potentially exploitable. |
| How points are won and lost | Break down winners, errors, and recurring sequences associated with winning or losing points. |
| Tactical change detection | Flag shifts within a match, such as more lifts, flatter exchanges, or different placement targets. |
| Annotated video collections | Automatically gather examples of a weakness, opponent tendency, or successful pattern, with notes and synchronized 3D views alongside the original video. |
| Game plans and practice recommendations | Turn findings into match instructions and drills: “Target this corner, anticipate this reply,” or “Practice deeper lifts under pressure.” |
| Progress tracking and goals | Track whether targeted weaknesses improve across matches, with specific goals and sample sizes. |
| Professional reference comparisons | Compare trajectories and sequences with professional examples from similar situations. |
| Video-based decision practice | Pause before contact, choose a response, then review what happened and discuss alternatives. |

## Shared foundation

- **Searchable rallies:** fans find memorable moments; coaches find tactical
  situations; players find examples to learn from.
- **Synchronized video and 3D playback:** each finding links to the exact shot and
  its surrounding rally context. Keep visualizations and annotations outside the
  embedded broadcast player.
- **Court-map filters:** select an origin, destination, or trajectory shape to
  find matching shots and rallies.
- **Saved collections:** “Best defensive rallies,” “Opponent backhand responses,”
  or “Patterns to practice.”

## Data dependencies and interpretation

- Calibrated 3D shuttle trajectories and reliable timing support flight paths,
  placement, height, speed, and consistency measurements.
- Shot sequences and tendency reports also need shot boundaries, shot types,
  and attribution to the correct player. Point-outcome analysis needs reliable
  outcome labels.
- Score-aware analysis needs match and score metadata. Personalized experiences
  need saved preferences; progress tracking needs comparable matches over time.
- Player court coverage, positioning, footwork, contact height, and doubles
  formations need additional player or racket tracking. Do not infer those from
  the shuttle path alone.
- Show sample sizes and confidence where relevant. A pattern associated with a
  winning point does not establish that the pattern caused the win.
- Keep professional comparisons specific to comparable situations; a single
  trajectory is not a universal ideal or a diagnosis of stroke technique.

## Homepage emphasis

The homepage explains individual features directly, with a clear size hierarchy
and selective illustration, following the restrained product presentation on
Supabase's homepage. The largest card is 3D shuttle reconstruction and contains
the showcase's only court illustration. Rally search and shot patterns sit
beside it as smaller primary cards, with concise text examples.

Use compact text cards for personalized highlights, shot comparisons, opponent
scouting, and training insights. Present serve-and-return analysis, saved
collections, and rally sharing as a quiet supporting row. Do not draw a separate
diagram for every feature. Label the planned feature showcase clearly.

Keep the current rally viewer prominent with the real sample match and compact
text for rally detection, replay filtering, score navigation, and the timeline.
The homepage feature tiles are explanations, not links to blog posts or working
controls for unimplemented features.

Reserve `/blog/entertainment` and `/blog/technical` for detailed breakdowns reached
through the footer. Those links replace Playback design and Detection notes; the
original engineering posts remain available in the blog.
