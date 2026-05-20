# CourtFlow — League Scheduler
A complete sports league scheduling tool built for GitHub Pages. No server required — everything runs in your browser and saves automatically to local storage.
## Features
- **Multi-league support** — create and switch between leagues
- **Team management** — add teams with full conflict date/time tracking
- **Gym management** — multiple gyms with configurable court counts
- **Smart scheduling** — round-robin algorithm that respects team conflict dates and time ranges, max games per team per week, back-to-back game days, and one game per team per day
- **Flexible time slots** — Quick Fill a time range or add individual start times
- **Editable schedule** — click any game to change date, time, or gym with no conflict enforcement
- **Flagged games panel** — any matchup that cannot be placed is flagged for manual assignment
- **Standings tracker** — enter scores and see live W/L/PCT standings
- **Export** — Print, PDF, and Excel
## How to Use
### 1. Setup Tab
Enter your league name, games per team, max games per week, game duration, and buffer time. Add gyms with their court counts. Add all teams then click Conflicts on each team to enter dates and times they cannot play.
### 2. Game Dates Tab
Click dates on the calendar to select game days. For each date check which gyms are available then add time slots. Use Quick Fill to enter a start and end time and slots will auto-generate based on game duration plus buffer. Use Add Time to manually add a specific start time.
### 3. Generate Tab
Review the pre-flight summary then click Generate Schedule. Any games that cannot fit the constraints are flagged for manual assignment.
### 4. Schedule Tab
View by Week, Date, or Team. Click Edit on any game to change its date, time, or gym. Assign flagged games from the yellow panel at the top. Export with Print, PDF, or Excel buttons.
### 5. Standings Tab
Enter scores for completed games. Standings auto-update with W, L, T, PCT, PF, PA, and plus/minus.
## Tips
For N teams there are N minus 1 unique rounds. Setting games per team higher than that will repeat matchups. Each court at each gym holds one game per time slot so 2 courts means 2 simultaneous games. Data persists in your browser local storage and stays between sessions unless you clear browser data. Use the dropdown in the header to switch between leagues.
